// SIR V2 — Enforcement de rate limiting por usuario (Auditoría: riesgo #1).
//
// Cada route LLM/Visión llama enforceRateLimit() justo después de autenticar.
// Evalúa todos los tiers del bucket vía el RPC atómico check_rate_limit; si
// CUALQUIER tier deniega, corta con 429 + Retry-After (body { error, detail }
// que ApiErrorNotice ya sabe mostrar).
//
// FAIL-OPEN: si el RPC no existe (migración no aplicada), falla o devuelve algo
// raro → PERMITIMOS y logueamos un warning. La app es single-user; el objetivo
// es atajar loops/accidentes/costo, no frenar a un atacante. Nunca bloqueamos
// al usuario legítimo por un problema del store de rate-limit.

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

import { RATE_LIMIT_TIERS, buildKey, type RateLimitBucket } from './config'
import { decide } from './window'

export type EnforceResult = { ok: true } | { ok: false; response: NextResponse }

function failOpen(bucket: string, reason: string): void {
  // Visible en los logs de Vercel; cuando haya Sentry con DSN se podría elevar.
  console.warn(`[ratelimit] fail-open bucket=${bucket}: ${reason}`)
}

export async function enforceRateLimit(
  supabase: SupabaseClient,
  userId: string,
  bucket: RateLimitBucket,
): Promise<EnforceResult> {
  let worstRetryAfterSec = 0

  for (const tier of RATE_LIMIT_TIERS[bucket]) {
    try {
      const { data, error } = await supabase.rpc('check_rate_limit', {
        p_key: buildKey(userId, bucket, tier.windowMs),
        p_window_seconds: Math.round(tier.windowMs / 1000),
      })
      if (error) {
        failOpen(bucket, error.message)
        continue
      }
      const row = Array.isArray(data) ? data[0] : data
      if (!row) {
        failOpen(bucket, 'RPC sin fila')
        continue
      }
      const hits = Number(row.hits)
      const windowStartMs = Date.parse(row.window_start_at)
      const nowMs = Date.parse(row.server_now)
      if (!Number.isFinite(hits) || !Number.isFinite(windowStartMs) || !Number.isFinite(nowMs)) {
        failOpen(bucket, 'RPC devolvió valores no numéricos')
        continue
      }
      const d = decide(hits, windowStartMs, nowMs, tier)
      if (!d.allowed && d.retryAfterSec > worstRetryAfterSec) {
        worstRetryAfterSec = d.retryAfterSec
      }
    } catch (e) {
      failOpen(bucket, e instanceof Error ? e.message : String(e))
    }
  }

  if (worstRetryAfterSec > 0) {
    const body = {
      error: 'Alcanzaste el límite de uso por ahora. Esperá un momento y reintentá.',
      detail: `Reintentá en ~${worstRetryAfterSec}s.`,
    }
    return {
      ok: false,
      response: NextResponse.json(body, {
        status: 429,
        headers: { 'Retry-After': String(worstRetryAfterSec) },
      }),
    }
  }

  return { ok: true }
}
