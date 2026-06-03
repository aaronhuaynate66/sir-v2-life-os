// SIR V2 — POST /api/health/ingest
//
// Endpoint de INGESTA de Apple Health vía la app de iOS "Health Auto Export"
// (automatización REST API). Camino 1: puente sin app nativa.
//
// Auth: NO usa sesión de Supabase (Health Auto Export no la soporta). El gate es
// un TOKEN secreto comparado contra process.env.HEALTH_INGEST_TOKEN, aceptado en
//   - Authorization: Bearer <token>   o
//   - x-health-token: <token>
//
// Es MONO-USUARIO: los datos se asocian al usuario de Aaron. Resolución:
//   - process.env.HEALTH_INGEST_USER_ID si está seteado (override explícito), o
//   - el único row de `profiles` si hay exactamente uno.
// Si hay 0 o >1 perfiles y no hay override → 500 con instrucción clara.
//
// Persistencia: cliente SERVICE ROLE (bypassa RLS) con user_id explícito. Escribe
// en health_metrics y sleep_records con source='apple_health'. Idempotente por
// (user_id, external_id) vía upsert ON CONFLICT (migration 0049). Reimportar el
// mismo día NO duplica. NO toca el "Registro rápido" manual (external_id NULL).
//
// Sin LLM ni Vision → sin riesgo de timeout; es escritura simple.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { reportApiError } from '@/lib/observability/reportApiError'
import { mapHealthAutoExport } from '@/lib/health/ingest/parse'
import type { HealthAutoExportPayload } from '@/lib/health/ingest/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const SOURCE = 'apple_health'

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

/** Compara dos strings en tiempo ~constante (evita timing oracle del token). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Extrae el token del header (Bearer o x-health-token). */
function readToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim()
  const x = req.headers.get('x-health-token')
  return x?.trim() || null
}

/** Resuelve el user_id mono-usuario. */
async function resolveUserId(admin: SupabaseClient): Promise<{ userId: string } | { error: string }> {
  const explicit = process.env.HEALTH_INGEST_USER_ID?.trim()
  if (explicit) return { userId: explicit }

  const { data, error } = await admin.from('profiles').select('id').limit(2)
  if (error) return { error: `No pude leer profiles: ${error.message}` }
  const rows = (data ?? []) as Array<{ id: string }>
  if (rows.length === 1) return { userId: rows[0].id }
  if (rows.length === 0) {
    return { error: 'No hay ningún perfil. Iniciá sesión una vez en la app o seteá HEALTH_INGEST_USER_ID.' }
  }
  return {
    error: 'Hay más de un perfil; seteá HEALTH_INGEST_USER_ID con el user id de Aaron en Vercel.',
  }
}

export async function POST(req: NextRequest) {
  // 1. Auth por token.
  const expected = process.env.HEALTH_INGEST_TOKEN
  if (!expected) {
    return errorJson(500, 'HEALTH_INGEST_TOKEN no configurada en el server.')
  }
  const token = readToken(req)
  if (!token || !safeEqual(token, expected)) {
    return errorJson(401, 'Token inválido o ausente.')
  }

  // 2. Service-role client.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return errorJson(500, 'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el server.')
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  // 3. Resolver usuario mono-usuario.
  const resolved = await resolveUserId(admin)
  if ('error' in resolved) return errorJson(500, 'No pude resolver el usuario.', resolved.error)
  const userId = resolved.userId

  // 4. Parsear el body.
  let payload: HealthAutoExportPayload
  try {
    payload = (await req.json()) as HealthAutoExportPayload
  } catch {
    return errorJson(400, 'JSON inválido en el body.')
  }
  if (!payload || typeof payload !== 'object') {
    return errorJson(400, 'Body vacío o no es un objeto.')
  }

  // 5. Mapear el payload a filas normalizadas (puro).
  const mapped = mapHealthAutoExport(payload)

  // 6. Upsert idempotente. Errores por tabla se acumulan; respondemos 207-style.
  try {
    let healthWritten = 0
    let sleepWritten = 0
    const errors: string[] = []

    if (mapped.healthMetrics.length > 0) {
      const rows = mapped.healthMetrics.map((m) => ({
        user_id: userId,
        type: m.type,
        value: m.value,
        unit: m.unit,
        note: m.note ?? null,
        measured_at: m.measuredAt,
        source: SOURCE,
        external_id: m.externalId,
      }))
      const { error } = await admin
        .from('health_metrics')
        .upsert(rows, { onConflict: 'user_id,external_id' })
      if (error) errors.push(`health_metrics: ${error.message}`)
      else healthWritten = rows.length
    }

    if (mapped.sleepRecords.length > 0) {
      const rows = mapped.sleepRecords.map((s) => ({
        user_id: userId,
        date: s.date,
        bedtime: s.bedtime,
        wake_time: s.wakeTime,
        duration: s.duration,
        quality: s.quality,
        notes: s.notes ?? null,
        source: SOURCE,
        external_id: s.externalId,
      }))
      const { error } = await admin
        .from('sleep_records')
        .upsert(rows, { onConflict: 'user_id,external_id' })
      if (error) errors.push(`sleep_records: ${error.message}`)
      else sleepWritten = rows.length
    }

    if (errors.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Falló la escritura de algunas métricas.',
          detail: errors.join(' · '),
          healthWritten,
          sleepWritten,
        },
        { status: 502 },
      )
    }

    return NextResponse.json(
      {
        ok: true,
        healthMetrics: healthWritten,
        sleepRecords: sleepWritten,
        skipped: mapped.skipped,
      },
      { status: 200 },
    )
  } catch (e) {
    reportApiError(e, { route: 'health/ingest' })
    const msg = e instanceof Error ? e.message : String(e)
    return errorJson(500, 'Error inesperado al ingestar.', msg.slice(0, 300))
  }
}
