// SIR V2 — GET /api/cron/score-snapshots
//
// Cron DIARIO: persiste un snapshot del SCORE RELACIONAL de TODAS las personas
// (de todos los usuarios) en person_score_snapshots (migración 0066). Robustez
// vs la captura on-view: acumula tendencia para TODA la red, no solo las fichas
// que se abren. Alimenta el delta del Alignment Engine (Etapa 4).
//
// Reusa computeRelationalScore (puro). El score se computa con los MISMOS inputs
// que muestra la ficha (importance, trust, recencia del último whatsapp_chat).
// interactionQualities se omite a propósito: la UI tampoco lo usa hoy
// (reciprocidad = null), así el snapshot coincide con lo que ve el usuario.
//
// Auth: CRON_SECRET (Bearer), igual que tracker-alerts/weekly-summary. Usa
// SUPABASE_SERVICE_ROLE_KEY para iterar todos los usuarios (bypass RLS).
// NO requiere env nuevo: ambos secrets ya existen para los otros crons.
//
// Idempotente por (user_id, person_id, date_bucket): re-ejecutar el mismo día
// sobrescribe, no duplica.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { computeRelationalScore } from '@/lib/people/relationalScore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface PersonRow {
  id: string
  user_id: string
  importance_score: number
  trust_level: number
}
interface ChatRow {
  person_id: string | null
  observed_at: string
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurada — el cron no corre sin protección.' }, { status: 500 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.' }, { status: 500 })
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  const now = new Date()
  const dateBucket = now.toISOString().slice(0, 10) // YYYY-MM-DD (UTC)

  // 1. Todas las personas (todos los usuarios).
  const { data: peopleData, error: peopleErr } = await admin
    .from('people')
    .select('id, user_id, importance_score, trust_level')
  if (peopleErr) {
    return NextResponse.json({ error: 'No se pudo leer people', detail: peopleErr.message }, { status: 500 })
  }
  const people = (peopleData ?? []) as unknown as PersonRow[]
  if (people.length === 0) {
    return NextResponse.json({ people: 0, snapshotted: 0, dateBucket }, { status: 200 })
  }

  // 2. Último whatsapp_chat curado por persona (1 query, reduce a max observed_at).
  const personIds = people.map((p) => p.id)
  const lastChatByPerson = new Map<string, string>()
  const { data: chatData } = await admin
    .from('observations')
    .select('person_id, observed_at')
    .eq('capture_type', 'whatsapp_chat')
    .eq('is_obsolete', false)
    .in('person_id', personIds)
    .order('observed_at', { ascending: false })
  for (const c of (chatData ?? []) as unknown as ChatRow[]) {
    if (c.person_id && !lastChatByPerson.has(c.person_id)) {
      lastChatByPerson.set(c.person_id, c.observed_at) // primera ocurrencia = más reciente (orden desc)
    }
  }

  // 3. Computar score + armar filas.
  const rows = people.map((p) => {
    const b = computeRelationalScore(
      {
        importanceScore: p.importance_score,
        trustLevel: p.trust_level,
        lastChatObservedAt: lastChatByPerson.get(p.id) ?? null,
      },
      now,
    )
    return {
      user_id: p.user_id,
      person_id: p.id,
      date_bucket: dateBucket,
      global: b.global,
      fuerza: b.fuerza,
      reciprocidad: b.reciprocidad,
      confianza: b.confianza,
      days_since_last_chat: b.daysSinceLastChat,
    }
  })

  // 4. Upsert idempotente por (user_id, person_id, date_bucket).
  const { error: upErr } = await admin
    .from('person_score_snapshots')
    .upsert(rows, { onConflict: 'user_id,person_id,date_bucket' })
  if (upErr) {
    return NextResponse.json({ error: 'No se pudieron guardar los snapshots', detail: upErr.message }, { status: 500 })
  }

  return NextResponse.json({ people: people.length, snapshotted: rows.length, dateBucket }, { status: 200 })
}
