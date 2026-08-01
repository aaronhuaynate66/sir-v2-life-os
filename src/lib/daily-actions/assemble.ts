// SIR V2 — Ensamblado de las Daily Actions ("Qué hacer hoy con quién").
//
// Extraído de GET /api/daily-actions para que HAYA UNA SOLA verdad: la ruta
// (superficie "Reconectar" en /panel) y el push de la mañana (cron) corren el
// MISMO ensamblado + los MISMOS motores puros (urgency + rituals + build). Así el
// nudge que llega por push/Telegram coincide exactamente con lo que ves en la app.
//
// Recibe un cliente Supabase YA resuelto (SSR con sesión en la ruta, service-role
// en el cron) y lee scoped por user_id. Sin escrituras. El scoring es puro.

import type { SupabaseClient } from '@supabase/supabase-js'

import { personAdapter, personLinkAdapter, relationshipAdapter } from '@/lib/supabase/sync/adapters/relationships'
import { computeRelationalScore } from '@/lib/people/relationalScore'
import { suggestCadenceDays, effectiveCadenceDays } from '@/lib/people/cadence'
import { contactDatesInRange } from '@/lib/horario/cockpit'
import {
  buildDailyActions,
  computeAvailability,
  type DailyAction,
  type DailyActionKind,
  type DailyActionPersonInput,
} from '@/lib/daily-actions/build'
import type { RitualSignal } from '@/lib/people/rituals'
import type { Person, PersonLink, RelationshipStatus, SignalType } from '@/types'

const DAY_MS = 86_400_000
const SIGNAL_LOOKBACK_DAYS = 30
const UPCOMING_LEAD_DAYS = 14

// "Reconecta" (serendipia de /panel): sólo acciones PROACTIVAS que nacen de ti
// saliendo a buscar a alguien — silencio/enfriamiento/reconocer una señal. Las
// de FECHA (cumple/especial) viven en la Agenda "Próximo", no acá.
export const RECONNECT_KINDS: DailyActionKind[] = ['contact', 'cooling', 'acknowledge']

export interface AssembledDailyActions {
  actions: DailyAction[]
  /** Disponibilidad del usuario 0-100 | null (de self_metrics). */
  availability: number | null
}

export interface AssembleOptions {
  /** 'reconnect' → sólo acciones proactivas (contact/cooling/acknowledge). */
  focus?: 'reconnect'
  /** Máximo de tarjetas. */
  limit?: number
}

/**
 * Ensambla las Daily Actions de la red para un usuario: lee su data real (score
 * relacional, recencia de contacto, cadencia, fechas, señales, disponibilidad) y
 * corre los motores puros. NO llama al LLM. `now` inyectable para tests.
 */
export async function assembleDailyActions(
  client: SupabaseClient,
  userId: string,
  now: Date,
  opts: AssembleOptions = {},
): Promise<AssembledDailyActions> {
  const isReconnect = opts.focus === 'reconnect'
  const limit = opts.limit ?? (isReconnect ? 5 : 6)
  const sinceIso = new Date(now.getTime() - SIGNAL_LOOKBACK_DAYS * DAY_MS).toISOString()

  const [peopleRes, relsRes, linksRes, chatsRes, logsRes, signalsRes, metricsRes] = await Promise.all([
    client.from('people').select('*').eq('user_id', userId),
    client.from('relationships').select('person_id, status').eq('user_id', userId),
    client.from('person_links').select('*').eq('user_id', userId),
    client
      .from('observations')
      .select('person_id, observed_at')
      .eq('user_id', userId)
      .in('capture_type', ['whatsapp_chat', 'whatsapp_web'])
      .eq('is_obsolete', false)
      .not('person_id', 'is', null)
      .order('observed_at', { ascending: false }),
    client
      .from('person_logs')
      .select('person_id, value, logged_at')
      .eq('user_id', userId)
      .eq('kind', 'interaction')
      .order('logged_at', { ascending: true }),
    client
      .from('signals')
      .select('related_persons, type, action_required, detected_at')
      .eq('user_id', userId)
      .gte('detected_at', sinceIso),
    client
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

  // Último chat (whatsapp) por persona — el primero que aparece (orden desc) —
  // y TODAS las fechas de chat por persona (para inferir el ritmo de contacto).
  const lastChatByPerson = new Map<string, string>()
  const chatDatesByPerson = new Map<string, string[]>()
  for (const row of (chatsRes.data ?? []) as Array<{ person_id: string | null; observed_at: string }>) {
    if (!row.person_id) continue
    if (!lastChatByPerson.has(row.person_id)) lastChatByPerson.set(row.person_id, row.observed_at)
    const arr = chatDatesByPerson.get(row.person_id) ?? []
    arr.push(row.observed_at)
    chatDatesByPerson.set(row.person_id, arr)
  }

  // Calidades de interacción por persona (orden cronológico) + último log.
  const eventsByPerson = new Map<string, { quality: number; at: string }[]>()
  const lastLogByPerson = new Map<string, string>()
  for (const row of (logsRes.data ?? []) as Array<{ person_id: string; value: number; logged_at: string }>) {
    const arr = eventsByPerson.get(row.person_id) ?? []
    arr.push({ quality: Number(row.value) || 0, at: row.logged_at })
    eventsByPerson.set(row.person_id, arr)
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
    const interactionEvents = eventsByPerson.get(person.id) ?? []
    const breakdown = computeRelationalScore(
      {
        importanceScore: person.importanceScore,
        trustLevel: person.trustLevel,
        lastChatObservedAt: lastChatIso,
        interactionEvents,
      },
      now,
    )

    const daysSinceContact = computeDaysSinceContact(
      lastChatIso,
      lastLogByPerson.get(person.id) ?? null,
      person.lastContact ?? null,
      now,
    )

    // Cadencia efectiva: texto explícito manda; en automática, el ritmo REAL
    // (chats + interacciones + último contacto) si hay señal robusta, si no la
    // capa. Alimenta el "overdue" del scoring igual que lo ve la lista.
    const contactDates = [
      ...(chatDatesByPerson.get(person.id) ?? []),
      ...interactionEvents.map((e) => e.at),
      person.lastContact ?? null,
    ]
    const suggestion = suggestCadenceDays(contactDates, person.category, now)
    const cadenceDays = effectiveCadenceDays(person.contactFrequency, person.category, suggestion).days

    return {
      person,
      fuerza: breakdown.fuerza,
      reciprocidad: breakdown.reciprocidad,
      confianza: breakdown.confianza,
      status: statusByPerson.get(person.id),
      daysSinceContact,
      contactFrequencyDays: cadenceDays,
      hasUpcomingDate: upcomingPersonIds.has(person.id),
      recentSignals: signalsByPerson.get(person.id) ?? [],
    }
  })

  const actions = buildDailyActions(
    inputs,
    { availability, limit, personLinks, kinds: isReconnect ? RECONNECT_KINDS : undefined },
    now,
  )

  return { actions, availability }
}

/** Días desde el contacto más reciente entre chat real, registro manual y la
 *  fecha manual people.last_contact. null si no hay ninguno. */
export function computeDaysSinceContact(
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
