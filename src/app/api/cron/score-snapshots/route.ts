// SIR V2 — GET /api/cron/score-snapshots
//
// Cron DIARIO: persiste un snapshot del SCORE RELACIONAL de TODAS las personas
// (de todos los usuarios) en person_score_snapshots (migración 0066). Robustez
// vs la captura on-view: acumula tendencia para TODA la red, no solo las fichas
// que se abren. Alimenta el delta del Alignment Engine (Etapa 4).
//
// Reusa computeRelationalScore (puro), con los MISMOS inputs que la ficha
// (importance, trust, recencia del último whatsapp_chat). interactionQualities
// se omite a propósito (la UI tampoco lo usa → reciprocidad = null).
//
// Auth: CRON_SECRET (Bearer). Usa SUPABASE_SERVICE_ROLE_KEY para iterar todos
// los usuarios (bypass RLS). Idempotente por (user_id, person_id, date_bucket).
//
// OBSERVABILIDAD: cada salida de error hace console.error con un prefijo
// [cron/score-snapshots] para que la causa sea visible en Runtime Logs de
// Vercel (antes devolvía 500 sin log → imposible diagnosticar).

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { computeRelationalScore } from '@/lib/people/relationalScore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const TAG = '[cron/score-snapshots]'

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
  try {
    const secret = process.env.CRON_SECRET
    if (!secret) {
      console.error(`${TAG} CRON_SECRET no configurada`)
      return NextResponse.json({ error: 'CRON_SECRET no configurada — el cron no corre sin protección.' }, { status: 500 })
    }
    if (req.headers.get('authorization') !== `Bearer ${secret}`) {
      console.error(`${TAG} authorization header no coincide con CRON_SECRET`)
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) {
      console.error(`${TAG} env faltante — url:${!!url} serviceKey:${!!serviceKey}`)
      return NextResponse.json(
        { error: 'Faltan envs', detail: `NEXT_PUBLIC_SUPABASE_URL:${!!url} SUPABASE_SERVICE_ROLE_KEY:${!!serviceKey}` },
        { status: 500 },
      )
    }
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

    const now = new Date()
    const dateBucket = now.toISOString().slice(0, 10) // YYYY-MM-DD (UTC)

    const { data: peopleData, error: peopleErr } = await admin
      .from('people')
      .select('id, user_id, importance_score, trust_level')
    if (peopleErr) {
      console.error(`${TAG} error leyendo people:`, peopleErr.message)
      return NextResponse.json({ error: 'No se pudo leer people', detail: peopleErr.message }, { status: 500 })
    }
    const people = (peopleData ?? []) as unknown as PersonRow[]
    if (people.length === 0) {
      return NextResponse.json({ people: 0, snapshotted: 0, dateBucket }, { status: 200 })
    }

    const personIds = people.map((p) => p.id)
    const lastChatByPerson = new Map<string, string>()
    const { data: chatData, error: chatErr } = await admin
      .from('observations')
      .select('person_id, observed_at')
      .eq('capture_type', 'whatsapp_chat')
      .eq('is_obsolete', false)
      .in('person_id', personIds)
      .order('observed_at', { ascending: false })
    if (chatErr) {
      // No es fatal: sin lastChat, fuerza usa el ajuste de "sin chat". Logueamos y seguimos.
      console.error(`${TAG} error leyendo observations (no fatal):`, chatErr.message)
    }
    for (const c of (chatData ?? []) as unknown as ChatRow[]) {
      if (c.person_id && !lastChatByPerson.has(c.person_id)) {
        lastChatByPerson.set(c.person_id, c.observed_at)
      }
    }

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

    const { error: upErr } = await admin
      .from('person_score_snapshots')
      .upsert(rows, { onConflict: 'user_id,person_id,date_bucket' })
    if (upErr) {
      console.error(`${TAG} error en upsert:`, upErr.message)
      return NextResponse.json({ error: 'No se pudieron guardar los snapshots', detail: upErr.message }, { status: 500 })
    }

    console.log(`${TAG} OK — ${rows.length} snapshots (${dateBucket})`)
    return NextResponse.json({ people: people.length, snapshotted: rows.length, dateBucket }, { status: 200 })
  } catch (e) {
    const detail = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e)
    console.error(`${TAG} excepción no manejada:`, detail)
    return NextResponse.json({ error: 'Excepción no manejada', detail: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
