// SIR V2 — POST /api/review/generate
//
// Escanea las fuentes conocidas y crea cards nuevas si no existen ya (upsert
// por unique index (user, source_kind, source_ref)). Devuelve cuántas se
// crearon por kind.
//
// Fuentes:
//   birthday → people.special_dates con label matching /cumple|birthday|nacim/i
//              Solo personas con importance_score >= 6.
//   memory   → memories con importance >= 7 y is_private = false.
//              Solo personas con importance_score >= 6.
//   identity → identity_profile.roles (siempre 1 card global "¿En qué roles trabajas?")

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

function err(status: number, error: string) { return NextResponse.json({ error }, { status }) }

interface NewCard {
  user_id: string
  question: string
  answer: string
  source_kind: 'birthday' | 'memory' | 'identity' | 'manual'
  source_ref: string
}

const CUMPLE_RE = /cumple|birthday|nacim/i

function formatBirthdayAnswer(dateStr: string): string {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  if (!m || !d) return dateStr
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${d} de ${meses[m - 1]}${y && y > 1900 ? ` de ${y}` : ''}`
}

export async function POST() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  const userId = auth.user.id
  const toInsert: NewCard[] = []

  // Existing sources for dedupe.
  const { data: existingRaw } = await supabase.from('review_cards')
    .select('source_kind, source_ref').eq('user_id', userId)
  const existing = new Set(((existingRaw ?? []) as Array<{ source_kind: string; source_ref: string | null }>).map((r) => `${r.source_kind}:${r.source_ref}`))

  // ─── 1. Cumpleaños ────────────────────────────────────────────
  const { data: peopleRaw } = await supabase.from('people')
    .select('id, name, special_dates, importance_score')
    .eq('user_id', userId).gte('importance_score', 6)
  const people = (peopleRaw ?? []) as Array<{ id: string; name: string; special_dates: unknown; importance_score: number | null }>
  for (const p of people) {
    const dates = Array.isArray(p.special_dates) ? p.special_dates as Array<{ label?: string; date?: string; id?: string }> : []
    const bday = dates.find((d) => typeof d.label === 'string' && CUMPLE_RE.test(d.label) && typeof d.date === 'string')
    if (!bday || !bday.date) continue
    const ref = p.id
    if (existing.has(`birthday:${ref}`)) continue
    toInsert.push({
      user_id: userId,
      question: `¿Cuándo cumple ${p.name}?`,
      answer: formatBirthdayAnswer(bday.date),
      source_kind: 'birthday',
      source_ref: ref,
    })
  }

  // ─── 2. Memorias importantes ──────────────────────────────────
  const { data: memRaw } = await supabase.from('memories')
    .select('id, person_id, title, content, importance')
    .eq('user_id', userId).eq('is_private', false).gte('importance', 7)
    .limit(200)
  const peopleById = new Map(people.map((p) => [p.id, p.name]))
  for (const m of ((memRaw ?? []) as Array<{ id: string; person_id: string; title: string; content: string; importance: number | null }>)) {
    if (existing.has(`memory:${m.id}`)) continue
    const personName = peopleById.get(m.person_id)
    if (!personName) continue // solo cercanos (importance>=6)
    const title = m.title?.trim() || m.content.slice(0, 80).trim()
    const answer = m.content?.slice(0, 500).trim() || title
    if (!title) continue
    toInsert.push({
      user_id: userId,
      question: `Sobre ${personName}: ${title}`,
      answer,
      source_kind: 'memory',
      source_ref: m.id,
    })
  }

  // ─── 3. Identidad propia ──────────────────────────────────────
  const { data: idRaw } = await supabase.from('identity_profile')
    .select('name, roles').eq('user_id', userId).maybeSingle()
  const idp = idRaw as { name?: string; roles?: unknown } | null
  if (idp?.roles && Array.isArray(idp.roles) && idp.roles.length > 0 && !existing.has('identity:roles')) {
    toInsert.push({
      user_id: userId,
      question: '¿Qué roles / actividades defines como tuyos hoy?',
      answer: (idp.roles as string[]).join(', '),
      source_kind: 'identity',
      source_ref: 'roles',
    })
  }

  if (toInsert.length === 0) return NextResponse.json({ created: 0, byKind: {} })
  const { error } = await supabase.from('review_cards').insert(toInsert)
  if (error) return err(500, error.message)

  const byKind = toInsert.reduce<Record<string, number>>((acc, c) => {
    acc[c.source_kind] = (acc[c.source_kind] ?? 0) + 1
    return acc
  }, {})

  return NextResponse.json({ created: toInsert.length, byKind })
}
