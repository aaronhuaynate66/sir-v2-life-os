// SIR V2 — GET /api/cron/derive-learnings (memoria que aprende sola).
//
// Cron SEMANAL: destila learnings DURABLES de lo que Aaron le dijo a SIR
// (sir_messages role=user) sin que él tenga que escribir un relato. Cierra la
// pata que faltaba de Fase 3d: los learnings entraban por carga manual o por
// relato-ingest; ahora también se derivan del sustrato acumulado.
//
// Conservador: pide al modelo solo lecciones estables y no obvias, no repetir
// lo ya sabido, confianza topada en 'medium' (source='derived'). Dedup por
// texto normalizado → refuerza en vez de duplicar (mismo patrón que relato-ingest).
//
// Auth: CRON_SECRET. Service-role para iterar usuarios. La telemetría de la
// llamada LLM se registra por (task='learning_derive').

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { complete } from '@/lib/llm'
import { DERIVE_SYSTEM_PROMPT, buildDeriveInput, parseDerivedLearnings } from '@/lib/learnings/derive'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DAY_MS = 86_400_000
const WINDOW_DAYS = 14
const MIN_SIGNALS = 5 // con menos fragmentos no vale gastar una llamada
const MAX_SIGNALS = 40
const USER_SCAN_LIMIT = 2000

const norm = (s: string) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET no configurada' }, { status: 500 })
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return NextResponse.json({ error: 'Faltan envs del server' }, { status: 500 })
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  const sinceIso = new Date(Date.now() - WINDOW_DAYS * DAY_MS).toISOString()

  // Usuarios que le hablaron a SIR en la ventana.
  const userIds = new Set<string>()
  const { data: actRows } = await admin
    .from('sir_messages').select('user_id').eq('role', 'user').gte('created_at', sinceIso).limit(USER_SCAN_LIMIT)
  for (const r of (actRows ?? []) as Array<{ user_id: string | null }>) if (r.user_id) userIds.add(r.user_id)

  const tally = { ok: 0, too_few: 0, empty: 0, inserted: 0, reinforced: 0, error: 0 }
  for (const userId of userIds) {
    try {
      const { data: msgs } = await admin
        .from('sir_messages').select('content')
        .eq('user_id', userId).eq('role', 'user').gte('created_at', sinceIso)
        .order('created_at', { ascending: false }).limit(MAX_SIGNALS)
      const signals = (msgs ?? [])
        .map((m) => (m as { content: string | null }).content ?? '')
        .filter((c) => typeof c === 'string' && c.trim().length > 8)
      if (signals.length < MIN_SIGNALS) { tally.too_few++; continue }

      const { data: existRows } = await admin
        .from('learnings').select('id, text, reinforced_count')
        .eq('user_id', userId).eq('is_active', true).limit(300)
      const existing = (existRows ?? []) as Array<{ id: string; text: string; reinforced_count: number | null }>

      const res = await complete(
        { task: 'learning_derive', tier: 'balanced', sensitivity: 'self', maxTokens: 500,
          system: DERIVE_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: buildDeriveInput(signals, existing.map((e) => e.text)) }] },
        { supabase: admin, userId },
      )
      const derived = parseDerivedLearnings(res.text)
      if (derived.length === 0) { tally.empty++; continue }

      for (const d of derived) {
        const hit = existing.find((e) => norm(e.text) === norm(d.text))
        if (hit) {
          await admin.from('learnings')
            .update({ reinforced_count: (hit.reinforced_count ?? 1) + 1, updated_at: new Date().toISOString() })
            .eq('id', hit.id).eq('user_id', userId)
          tally.reinforced++
        } else {
          const { error } = await admin.from('learnings')
            .insert({ user_id: userId, text: d.text, kind: d.kind, source: 'derived', confidence: d.confidence })
          if (!error) { tally.inserted++; existing.push({ id: 'new', text: d.text, reinforced_count: 1 }) }
        }
      }
      tally.ok++
    } catch {
      tally.error++
    }
  }

  return NextResponse.json({ ok: true, users: userIds.size, tally }, { status: 200 })
}
