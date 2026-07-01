// SIR V2 — GET /api/cron/brain-consolidate
//
// Cron NOCTURNO: multiplica cada edge_weights.weight por NIGHT_DECAY_FACTOR
// (default 0.98) para modelar "olvido saludable" del cerebro. Filas con
// |weight| < CLEANUP_THRESHOLD (0.05) se BORRAN — ya no aportan senal y
// ensucian la difusion.
//
// Sin este cron el aprendizaje Hebbian de F3 acumularia deltas viejos que
// sesgan la difusion cuando el mundo cambia. Es el analogo tecnico del
// "sueño" del handoff §7.
//
// Auth: CRON_SECRET (Bearer). Usa SUPABASE_SERVICE_ROLE_KEY para tocar
// edge_weights de TODOS los usuarios (bypass RLS). Idempotente en la
// practica: correr dos veces el mismo dia solo aplica dos decays seguidos —
// no es catastrofico pero no ideal. El schedule diario evita el problema.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { applyNightDecay, NIGHT_DECAY_FACTOR, CLEANUP_THRESHOLD } from '@/lib/brain/consolidation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const TAG = '[cron/brain-consolidate]'

interface EdgeWeightRow {
  user_id: string
  edge_key: string
  weight: number | string
}

export async function GET(req: NextRequest) {
  try {
    const secret = process.env.CRON_SECRET
    if (!secret) {
      console.error(`${TAG} CRON_SECRET no configurada`)
      return NextResponse.json({ error: 'CRON_SECRET no configurada' }, { status: 500 })
    }
    if (req.headers.get('authorization') !== `Bearer ${secret}`) {
      console.error(`${TAG} authorization no coincide`)
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) {
      console.error(`${TAG} env faltante — url:${!!url} serviceKey:${!!serviceKey}`)
      return NextResponse.json(
        { error: 'Faltan envs', detail: `URL:${!!url} SERVICE:${!!serviceKey}` },
        { status: 500 },
      )
    }

    const supabase = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Lee toda la tabla — mono-usuario en la practica, y aunque fuera multi
    // el tamano de edge_weights nunca es enorme (miles de filas top).
    const { data, error } = await supabase
      .from('edge_weights')
      .select('user_id, edge_key, weight')
    if (error) {
      // Fail-open: si la tabla no existe (mig 0106 no corrio), no rompe el
      // cron. Devuelve 200 con nota.
      if (String(error.code ?? '').startsWith('42') || String(error.message ?? '').toLowerCase().includes('does not exist')) {
        return NextResponse.json({ ok: true, note: 'edge_weights no existe todavia', processed: 0, cleaned: 0 })
      }
      console.error(`${TAG} read error`, error)
      return NextResponse.json({ error: 'read_failed', detail: error.message }, { status: 500 })
    }

    const rows = (data ?? []) as EdgeWeightRow[]
    const toUpdate: Array<{ user_id: string; edge_key: string; weight: number }> = []
    const toDelete: Array<{ user_id: string; edge_key: string }> = []

    for (const r of rows) {
      const w = typeof r.weight === 'string' ? Number(r.weight) : r.weight
      const res = applyNightDecay(w)
      if (res.shouldDelete) {
        toDelete.push({ user_id: r.user_id, edge_key: r.edge_key })
      } else if (res.weight !== null) {
        toUpdate.push({ user_id: r.user_id, edge_key: r.edge_key, weight: res.weight })
      }
    }

    let updatedCount = 0
    let deletedCount = 0

    // Updates: batch en tanadas por evitar payloads gigantes. edge_weights
    // tiene PK compuesta (user_id, edge_key) — usamos upsert con onConflict.
    for (const chunk of chunks(toUpdate, 200)) {
      const nowIso = new Date().toISOString()
      const rowsBatch = chunk.map((r) => ({ ...r, updated_at: nowIso }))
      const { error: upErr } = await supabase
        .from('edge_weights')
        .upsert(rowsBatch, { onConflict: 'user_id,edge_key' })
      if (upErr) {
        console.error(`${TAG} upsert error`, upErr)
        continue
      }
      updatedCount += chunk.length
    }

    // Deletes: uno por fila (PK compuesta no acepta .in() para pares).
    for (const d of toDelete) {
      const { error: delErr } = await supabase
        .from('edge_weights')
        .delete()
        .eq('user_id', d.user_id)
        .eq('edge_key', d.edge_key)
      if (delErr) {
        console.error(`${TAG} delete error`, delErr)
        continue
      }
      deletedCount += 1
    }

    return NextResponse.json({
      ok: true,
      processed: rows.length,
      updated: updatedCount,
      cleaned: deletedCount,
      factor: NIGHT_DECAY_FACTOR,
      threshold: CLEANUP_THRESHOLD,
    })
  } catch (e) {
    console.error(`${TAG} fatal`, e)
    return NextResponse.json({ error: 'fatal', detail: String(e).slice(0, 200) }, { status: 500 })
  }
}

function* chunks<T>(arr: T[], size: number): Generator<T[]> {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size)
}
