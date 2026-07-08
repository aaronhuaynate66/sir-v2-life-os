// SIR V2 — POST /api/relato/reprocess-tone (backfill de tono).
//
// Re-infiere el tono de los person_logs kind='interaction' que quedaron en
// value=3 por falta de rúbrica (ver fix de tono en tools.ts). LEE la nota que
// Aaron ya escribió y le asigna un 1-5 más fiel. Solo toca value=3 CON nota →
// reversible (el estado original es uniforme: todos eran 3).
//
// dry-run (default): procesa una muestra y devuelve la nueva distribución +
// ejemplos, SIN escribir. apply:true → procesa TODO y actualiza.
//
// Mono-usuario, session-auth, rate-limited, Haiku (barato). Solo prod tiene
// ANTHROPIC_API_KEY (503 si falta).

import Anthropic from '@anthropic-ai/sdk'
import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { reportApiError } from '@/lib/observability/reportApiError'
import { TONE_BATCH_SYSTEM, buildToneBatchPrompt, parseToneBatch } from '@/lib/relato-ingest/toneFromNote'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const MODEL_ID = 'claude-haiku-4-5-20251001'
const BATCH = 25
const DEFAULT_SAMPLE = 40
const MAX_LOGS = 2000

interface Row { id: string; note: string | null }

/** Clasifica un lote de notas → tonos 1-5 (o null si el modelo falló/no matcheó). */
async function classifyBatch(client: Anthropic, notes: string[]): Promise<number[] | null> {
  const msg = await client.messages.create({
    model: MODEL_ID,
    max_tokens: 700,
    system: TONE_BATCH_SYSTEM,
    messages: [{ role: 'user', content: buildToneBatchPrompt(notes) }],
  })
  const block = msg.content.find((b) => b.type === 'text')
  const text = block && block.type === 'text' ? block.text : ''
  return parseToneBatch(text, notes.length)
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const userId = auth.user.id

  const rl = await enforceRateLimit(supabase, userId, 'generation')
  if (!rl.ok) return rl.response

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Falta ANTHROPIC_API_KEY (solo en prod)' }, { status: 503 })
  }

  let body: { apply?: unknown; sampleSize?: unknown }
  try { body = (await req.json()) as typeof body } catch { body = {} }
  const apply = body.apply === true
  const sampleSize = typeof body.sampleSize === 'number' && body.sampleSize > 0
    ? Math.min(200, Math.floor(body.sampleSize)) : DEFAULT_SAMPLE

  // Candidatos: interacción, value=3, con nota. En dry-run limitamos a la muestra.
  const { data, error } = await supabase
    .from('person_logs')
    .select('id, note')
    .eq('user_id', userId)
    .eq('kind', 'interaction')
    .eq('value', 3)
    .not('note', 'is', null)
    .order('logged_at', { ascending: false })
    .limit(apply ? MAX_LOGS : sampleSize)
  if (error) return NextResponse.json({ error: 'No se pudo leer los logs', detail: error.message }, { status: 500 })

  const rows = ((data ?? []) as Row[]).filter((r) => (r.note ?? '').trim().length > 0)
  if (rows.length === 0) {
    return NextResponse.json({ mode: apply ? 'apply' : 'dry', total: 0, changed: 0, message: 'No hay logs para reprocesar.' })
  }

  const client = new Anthropic({ maxRetries: 2 })
  const proposals: { id: string; to: number; note: string }[] = []
  let skipped = 0
  try {
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH)
      const tones = await classifyBatch(client, chunk.map((r) => r.note as string))
      if (!tones) { skipped += chunk.length; continue }
      chunk.forEach((r, j) => proposals.push({ id: r.id, to: tones[j], note: r.note as string }))
    }
  } catch (e) {
    reportApiError(e, { route: 'relato/reprocess-tone' })
    return NextResponse.json({ error: 'Falló la clasificación', detail: String(e).slice(0, 140) }, { status: 502 })
  }

  const changed = proposals.filter((p) => p.to !== 3)
  const newDistribution: Record<number, number> = {}
  for (const p of proposals) newDistribution[p.to] = (newDistribution[p.to] ?? 0) + 1

  if (!apply) {
    return NextResponse.json({
      mode: 'dry',
      total: proposals.length,
      changed: changed.length,
      skipped,
      newDistribution,
      sample: changed.slice(0, 12).map((p) => ({ to: p.to, note: p.note.slice(0, 90) })),
    })
  }

  // Apply: agrupamos por tono destino → ≤5 updates en bloque (no 1 por fila).
  let applied = 0
  try {
    for (let t = 1; t <= 5; t++) {
      if (t === 3) continue // no reescribimos los que siguen neutros.
      const ids = changed.filter((p) => p.to === t).map((p) => p.id)
      if (ids.length === 0) continue
      const { error: upErr } = await supabase.from('person_logs').update({ value: t }).in('id', ids)
      if (upErr) return NextResponse.json({ error: 'Falló el update', detail: upErr.message, applied }, { status: 500 })
      applied += ids.length
    }
  } catch (e) {
    return NextResponse.json({ error: 'Falló el update', detail: String(e).slice(0, 140), applied }, { status: 500 })
  }

  return NextResponse.json({ mode: 'apply', total: proposals.length, changed: changed.length, applied, skipped, newDistribution })
}
