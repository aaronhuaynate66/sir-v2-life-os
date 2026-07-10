// SIR V2 — GET /api/panel/inbound ("Lo que entró de tu gente").
//
// Vista REACTIVA de la ingesta ambiental cross-canal: cruza TODAS las personas y
// TODOS los canales de conversación (WhatsApp, Teams/Slack/Correo por el Reader,
// DMs) y devuelve quién te escribió reciente, por qué canal, el gist y si quedó
// en tu cancha. Ensambla data REAL y corre el motor PURO (buildInboundFeed). NO
// llama al LLM → instantáneo. Lecturas RLS-scoped (+ .eq('user_id') defensivo).
//
// Espejo de /api/daily-actions (proactivo: a quién SALIR a buscar). Acá no
// rankeamos por urgencia relacional: reflejamos lo que LLEGÓ, por recencia.

import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'
import { CONVERSATION_CAPTURE_TYPES } from '@/lib/capture/observations/types'
import {
  buildInboundFeed,
  type InboundDirectionSample,
  type InboundFeedItem,
  type InboundObservationInput,
  type InboundPersonMeta,
} from '@/lib/panel/inboundFeed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

const DAY_MS = 86_400_000
const WINDOW_DAYS = 14
const OBS_LIMIT = 500
const DIR_LIMIT = 600

interface InboundResponse {
  items: InboundFeedItem[]
  generatedAt: string
}

export async function GET(request: Request): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const userId = authData.user.id
  const now = new Date()

  const url = new URL(request.url)
  const limit = parseLimit(url.searchParams.get('limit'), 8)
  const cutoffIso = new Date(now.getTime() - WINDOW_DAYS * DAY_MS).toISOString()

  try {
    // Sólo conversaciones REALES (no perfiles), no obsoletas, con persona, en ventana.
    const obsRes = await supabase
      .from('observations')
      .select('person_id, capture_type, data, observed_at')
      .eq('user_id', userId)
      .in('capture_type', [...CONVERSATION_CAPTURE_TYPES])
      .eq('is_obsolete', false)
      .not('person_id', 'is', null)
      .gte('observed_at', cutoffIso)
      .order('observed_at', { ascending: false })
      .limit(OBS_LIMIT)

    const rows = (obsRes.data ?? []) as Array<{
      person_id: string | null
      capture_type: string
      data: Record<string, unknown> | null
      observed_at: string
    }>

    const personIds = [...new Set(rows.map((r) => r.person_id).filter((id): id is string => !!id))]
    if (personIds.length === 0) {
      const empty: InboundResponse = { items: [], generatedAt: now.toISOString() }
      return NextResponse.json(empty, { status: 200 })
    }

    // Personas del feed + dirección del sustrato (chat_messages) para "esperando
    // respuesta". Sólo las personas presentes en el feed (IN acotado).
    const [peopleRes, dirRes] = await Promise.all([
      supabase.from('people').select('id, name, slug').eq('user_id', userId).in('id', personIds),
      supabase
        .from('chat_messages')
        .select('person_id, sender, sent_at')
        .eq('user_id', userId)
        .in('person_id', personIds)
        .order('sent_at', { ascending: false, nullsFirst: false })
        .limit(DIR_LIMIT),
    ])

    const peopleById = new Map<string, InboundPersonMeta>()
    for (const p of (peopleRes.data ?? []) as Array<{ id: string; name: string; slug: string | null }>) {
      peopleById.set(p.id, { name: p.name, slug: p.slug ?? null })
    }

    const observations: InboundObservationInput[] = rows.map((r) => ({
      personId: r.person_id as string,
      captureType: r.capture_type,
      platform: strOrNull(r.data?.platform),
      summary: strOrNull(r.data?.summary),
      observedAt: r.observed_at,
    }))

    const direction: InboundDirectionSample[] = ((dirRes.data ?? []) as Array<{
      person_id: string
      sender: string
      sent_at: string | null
    }>)
      .filter((d) => !!d.sent_at)
      .map((d) => ({ personId: d.person_id, sender: d.sender, sentAt: d.sent_at as string }))

    const items = buildInboundFeed(observations, peopleById, direction, {
      now,
      windowDays: WINDOW_DAYS,
      limit,
    })

    const body: InboundResponse = { items, generatedAt: now.toISOString() }
    return NextResponse.json(body, { status: 200 })
  } catch (e) {
    reportApiError(e, { route: 'panel/inbound' })
    return NextResponse.json({ error: 'No se pudo armar el feed de entrada' }, { status: 500 })
  }
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null
}

function parseLimit(raw: string | null, fallback: number): number {
  const n = raw == null ? NaN : Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.max(1, Math.min(20, Math.floor(n)))
}
