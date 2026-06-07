// SIR V2 — GET /api/daily-actions (GEMA A+B).
//
// "Qué hacer hoy con quién." Ensambla la data REAL de la red (score relacional,
// recencia de contacto, fechas, señales, disponibilidad del usuario) y corre
// los motores PUROS (urgency + rituals + build). NO llama al LLM → respuesta
// instantánea, sin riesgo de timeout/502. El mensaje copiable se pide aparte y
// on-demand a /api/daily-actions/message.
//
// Lecturas RLS-scoped (+ .eq('user_id') defensivo). Sin escrituras.

import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'
import { personAdapter, personLinkAdapter, relationshipAdapter } from '@/lib/supabase/sync/adapters/relationships'
import { computeRelationalScore } from '@/lib/people/relationalScore'
import { contactFrequencyDays } from '@/lib/people/urgency'
import { contactDatesInRange } from '@/lib/horario/cockpit'
import {
  buildDailyActions,
  computeAvailability,
  type DailyAction,
  type DailyActionPersonInput,
} from '@/lib/daily-actions/build'
import type { RitualSignal } from '@/lib/people/rituals'
import type { Person, PersonLink, RelationshipStatus, SignalType } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

const DAY_MS = 86_400_000
const SIGNAL_LOOKBACK_DAYS = 30
const UPCOMING_LEAD_DAYS = 14

interface DailyActionsResponse {
  actions: DailyAction[]
  /** Disponibilidad del usuario 0-100 | null (de self_metrics). */
  availability: number | null
  generatedAt: string
}

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const userId = authData.user.id
  const now = new Date()
  const sinceIso = new Date(now.getTime() - SIGNAL_LOOKBACK_DAYS * DAY_MS).toISOString()

  try {
    const [peopleRes, relsRes, linksRes, chatsRes, logsRes, signalsRes, metricsRes] = await Promise.all([
      supabase.from('people').select('*').eq('user_id', userId),
      supabase.from('relationships').select('person_id, status').eq('user_id', userId),
      supabase.from('person_links').select('*').eq('user_id', userId),
      supabase
        .from('observations')
        .select('person_id, observed_at')
        .eq('user_id', userId)
        .in('capture_type', ['whatsapp_chat', 'whatsapp_web'])
        .eq('is_obsolete', false)
        .not('person_id', 'is', null)
        .order('observed_at', { ascending: false }),
      supabase
        .from('person_logs')
        .select('person_id, value, logged_at')
        .eq('user_id', userId)
        .eq('kind', 'interaction')
        .order('logged_at', { ascending: true }),
      supabase
        .from('signals')
        .select('related_persons, type, action_required, detected_at')
        .eq('user_id', userId)
        .gte('detected_at', sinceIso),
      supabase
        .from('self_metrics')
        .select('category, value, measured_at')
        .eq('user_id', userId)
        .in('category', ['energy', 'mood', 'stress'])
        .order('measured_at', { ascending: false }),
    ])

    const people: Person[] = (peopleRes.data ?? []).map((r) =>
      personAdapter.fromRow(r as Record<string, unknown>),
    )

    // Aristas SELF↔persona: ponderan el esfuerzo relacional por parentesco
    // (familia/pareja pesan más), igual que el ranking no_contact de /panel.
    const personLinks: PersonLink[] = (linksRes.data ?? []).map((r) =>
      personLinkAdapter.fromRow(r as Record<string, unknown>),
    )

    // Status por persona (de relationships).
    const statusByPerson = new Map<string, RelationshipStatus>()
    for (const r of relsRes.data ?? []) {
      const rel = relationshipAdapter.fromRow(r as Record<string, unknown>)
      statusByPerson.set(rel.personId, rel.status)
    }

    // Último chat (whatsapp) por persona — el primero que aparece (orden desc).
    const lastChatByPerson = new Map<string, string>()
    for (const row of (chatsRes.data ?? []) as Array<{ person_id: string | null; observed_at: string }>) {
      if (row.person_id && !lastChatByPerson.has(row.person_id)) {
        lastChatByPerson.set(row.person_id, row.observed_at)
      }
    }

    // Calidades de interacción por persona (orden cronológico) + último log.
    const qualitiesByPerson = new Map<string, number[]>()
    const lastLogByPerson = new Map<string, string>()
    for (const row of (logsRes.data ?? []) as Array<{ person_id: string; value: number; logged_at: string }>) {
      const arr = qualitiesByPerson.get(row.person_id) ?? []
      arr.push(Number(row.value) || 0)
      qualitiesByPerson.set(row.person_id, arr)
      lastLogByPerson.set(row.person_id, row.logged_at) // asc → queda el más nuevo
    }

    // Señales recientes por persona.
    const signalsByPerson = new Map<string, RitualSignal[]>()
    for (const row of (signalsRes.data ?? []) as Array<{
      related_persons: string[] | null
      type: SignalType
      action_required: boolean | null
      detected_at: string
    }>) {
      for (const pid of row.related_persons ?? []) {
        const arr = signalsByPerson.get(pid) ?? []
        arr.push({ type: row.type, detectedAt: row.detected_at, actionRequired: !!row.action_required })
        signalsByPerson.set(pid, arr)
      }
    }

    // Fechas próximas (cumple/especiales ≤14d) → set de personIds.
    const upcomingPersonIds = new Set<string>()
    for (const d of contactDatesInRange(people, UPCOMING_LEAD_DAYS, now)) {
      if (d.personId) upcomingPersonIds.add(d.personId)
    }

    // Disponibilidad: self_metric más reciente por categoría (orden desc).
    const latestMetric: Record<string, number> = {}
    for (const row of (metricsRes.data ?? []) as Array<{ category: string; value: number }>) {
      if (!(row.category in latestMetric)) latestMetric[row.category] = Number(row.value)
    }
    const availability = computeAvailability({
      energy: latestMetric.energy ?? null,
      mood: latestMetric.mood ?? null,
      stress: latestMetric.stress ?? null,
    })

    // Ensamblar input por persona.
    const inputs: DailyActionPersonInput[] = people.map((person) => {
      const lastChatIso = lastChatByPerson.get(person.id) ?? null
      const qualities = qualitiesByPerson.get(person.id) ?? []
      const breakdown = computeRelationalScore(
        {
          importanceScore: person.importanceScore,
          trustLevel: person.trustLevel,
          lastChatObservedAt: lastChatIso,
          interactionQualities: qualities,
        },
        now,
      )

      const daysSinceContact = computeDaysSinceContact(
        lastChatIso,
        lastLogByPerson.get(person.id) ?? null,
        person.lastContact ?? null,
        now,
      )

      return {
        person,
        fuerza: breakdown.fuerza,
        reciprocidad: breakdown.reciprocidad,
        confianza: breakdown.confianza,
        status: statusByPerson.get(person.id),
        daysSinceContact,
        contactFrequencyDays: contactFrequencyDays(person.contactFrequency, person.category),
        hasUpcomingDate: upcomingPersonIds.has(person.id),
        recentSignals: signalsByPerson.get(person.id) ?? [],
      }
    })

    const actions = buildDailyActions(inputs, { availability, limit: 6, personLinks }, now)

    const body: DailyActionsResponse = { actions, availability, generatedAt: now.toISOString() }
    return NextResponse.json(body, { status: 200 })
  } catch (e) {
    reportApiError(e, { route: 'daily-actions' })
    return NextResponse.json({ error: 'No se pudieron generar las acciones del día' }, { status: 500 })
  }
}

/** Días desde el contacto más reciente entre chat real, registro manual y la
 *  fecha manual people.last_contact. null si no hay ninguno. */
function computeDaysSinceContact(
  lastChatIso: string | null,
  lastLogIso: string | null,
  lastContactDate: string | null,
  now: Date,
): number | null {
  const candidates: number[] = []
  for (const iso of [lastChatIso, lastLogIso, lastContactDate]) {
    if (!iso) continue
    const ms = Date.parse(iso)
    if (Number.isFinite(ms) && ms <= now.getTime()) candidates.push(ms)
  }
  if (candidates.length === 0) return null
  const mostRecent = Math.max(...candidates)
  return Math.max(0, Math.floor((now.getTime() - mostRecent) / DAY_MS))
}
