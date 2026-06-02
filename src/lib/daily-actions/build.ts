// SIR V2 — Daily Actions: fusión de urgencia + rituales + disponibilidad.
//
// "Qué hacer hoy con quién." Mezcla dos motores puros:
//   - scoreContactUrgency (lib/people/urgency) — a quién contactar y por qué.
//   - generateRituals (lib/people/rituals) — cumpleaños/fechas/reconexión.
// y pondera por la DISPONIBILIDAD del usuario (self_metrics), como el Advisor
// de v1: cuando estás mal, no te empuja a buscar gente proactivamente (pero un
// cumpleaños sigue siendo un cumpleaños — las fechas no se atenúan).
//
// Una tarjeta por persona (la razón más urgente gana), ordenadas por score.
// PURA + determinística: `now` inyectable, sin I/O. Testeable.

import type { Person, PersonCategory, RelationshipStatus, RelationshipType } from '@/types'
import { scoreContactUrgency } from '@/lib/people/urgency'
import { generateRituals, type Ritual, type RitualSignal } from '@/lib/people/rituals'

export type DailyActionKind = 'contact' | 'birthday' | 'special_date' | 'cooling' | 'acknowledge'

export interface DailyAction {
  personId: string
  personName: string
  personSlug?: string
  relationship: RelationshipType
  category: PersonCategory
  kind: DailyActionKind
  urgency: 'high' | 'medium' | 'low'
  /** Score interno de orden (0-~130). No se muestra crudo. */
  score: number
  /** Qué pasa ("Sin hablar hace 34 días"). */
  headline: string
  /** Qué hacer ("Escribile para retomar"). */
  action: string
  /** Reciprocidad 0-100 | null (GEMA C) — visible en la tarjeta. */
  reciprocidad: number | null
  /** Fuerza 0-100 — visible en la tarjeta. */
  fuerza: number
  daysSinceContact: number | null
  /** Días hasta la fecha (sólo birthday/special_date). */
  daysUntil?: number
  /** ¿Puede pedir un mensaje copiable al LLM? */
  canGenerateMessage: boolean
}

/** Una persona ya enriquecida con su score relacional y contexto de contacto. */
export interface DailyActionPersonInput {
  person: Person
  fuerza: number
  reciprocidad: number | null
  confianza: number
  status?: RelationshipStatus
  daysSinceContact: number | null
  contactFrequencyDays: number
  hasUpcomingDate: boolean
  recentSignals: RitualSignal[]
}

export interface AvailabilityInput {
  /** self_metrics más reciente (0-10) por categoría. */
  energy?: number | null
  mood?: number | null
  stress?: number | null
}

/**
 * Disponibilidad del usuario (0-100) a partir de self_metrics: promedio de
 * energía, ánimo y (10 - estrés), todo a escala 0-10 → x10. null si no hay
 * ninguna métrica (no inventamos un estado). Mayor = mejor para reconectar.
 */
export function computeAvailability(a: AvailabilityInput): number | null {
  const parts: number[] = []
  if (typeof a.energy === 'number' && Number.isFinite(a.energy)) parts.push(clamp10(a.energy))
  if (typeof a.mood === 'number' && Number.isFinite(a.mood)) parts.push(clamp10(a.mood))
  if (typeof a.stress === 'number' && Number.isFinite(a.stress)) parts.push(10 - clamp10(a.stress))
  if (parts.length === 0) return null
  const avg = parts.reduce((s, v) => s + v, 0) / parts.length
  return Math.round(avg * 10)
}

function clamp10(n: number): number {
  return Math.max(0, Math.min(10, n))
}

/**
 * Factor de ponderación por disponibilidad para acciones PROACTIVAS (contact,
 * cooling). [0.7 .. 1.1]: energía baja atenúa (no te empuja a buscar gente
 * cuando estás drenado); energía alta da un pequeño empujón. null (sin datos) →
 * 1.0 neutral. Las acciones por FECHA no se tocan (un cumpleaños es un cumpleaños).
 */
function availabilityFactor(availability: number | null): number {
  if (availability === null) return 1.0
  return 0.7 + (clamp(availability, 0, 100) / 100) * 0.4
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

// Acciones donde VOS salís a buscar a alguien → se atenúan si estás drenado.
// Las de fecha (birthday/special_date) no: un cumpleaños no espera tu energía.
const PROACTIVE: ReadonlySet<DailyActionKind> = new Set<DailyActionKind>([
  'contact',
  'cooling',
  'acknowledge',
])

/** El ritual 'no_contact' es conceptualmente un "contacto" (salir a retomar). */
function kindFromRitual(type: Ritual['type']): DailyActionKind {
  return type === 'no_contact' ? 'contact' : type
}

/** Score de un ritual → escala 0-~120 comparable con la urgencia de contacto. */
function ritualScore(r: Ritual): number {
  return r.priority * 12
}

function ritualUrgency(r: Ritual): DailyAction['urgency'] {
  if (r.priority >= 9) return 'high'
  if (r.priority >= 6) return 'medium'
  return 'low'
}

export interface BuildDailyActionsOptions {
  /** Disponibilidad 0-100 | null (de computeAvailability). */
  availability?: number | null
  /** Máximo de tarjetas. Default 6. */
  limit?: number
}

/**
 * Construye las Daily Actions de la red: una tarjeta por persona (su razón más
 * urgente), ponderadas por disponibilidad, ordenadas por score desc.
 */
export function buildDailyActions(
  inputs: DailyActionPersonInput[],
  opts: BuildDailyActionsOptions = {},
  now: Date = new Date(),
): DailyAction[] {
  const availability = opts.availability ?? null
  const factor = availabilityFactor(availability)
  const limit = opts.limit ?? 6

  const byId = new Map(inputs.map((i) => [i.person.id, i]))
  const candidates: DailyAction[] = []

  // 1. Acción de contacto por persona (urgencia).
  for (const i of inputs) {
    if (i.status === 'ended') continue // vínculo terminado: no sugerimos retomar
    const u = scoreContactUrgency({
      fuerza: i.fuerza,
      reciprocidad: i.reciprocidad,
      confianza: i.confianza,
      category: i.person.category,
      status: i.status,
      daysSinceContact: i.daysSinceContact,
      contactFrequencyDays: i.contactFrequencyDays,
      hasUpcomingDate: i.hasUpcomingDate,
      recentSignalCount: i.recentSignals.length,
    })
    // Sólo proponemos un "contacto" si hay algo que decir (no los "al día").
    if (u.urgency === 'low' && u.score < 35) continue
    candidates.push({
      personId: i.person.id,
      personName: i.person.name,
      personSlug: i.person.slug,
      relationship: i.person.relationship,
      category: i.person.category,
      kind: 'contact',
      urgency: u.urgency,
      score: u.score * factor,
      headline: u.reason,
      action: 'Escribile para retomar el contacto',
      reciprocidad: i.reciprocidad,
      fuerza: i.fuerza,
      daysSinceContact: i.daysSinceContact,
      canGenerateMessage: true,
    })
  }

  // 2. Rituales (cumpleaños/fechas/cooling/acknowledge).
  const rituals = generateRituals(
    inputs
      .filter((i) => i.status !== 'ended')
      .map((i) => ({
        person: i.person,
        daysSinceContact: i.daysSinceContact,
        fuerza: i.fuerza,
        status: i.status,
        recentSignals: i.recentSignals,
      })),
    now,
  )
  for (const r of rituals) {
    const i = byId.get(r.personId)
    if (!i) continue
    const kind = kindFromRitual(r.type)
    const proactive = PROACTIVE.has(kind)
    candidates.push({
      personId: r.personId,
      personName: r.personName,
      personSlug: r.personSlug,
      relationship: i.person.relationship,
      category: i.person.category,
      kind,
      urgency: ritualUrgency(r),
      score: proactive ? ritualScore(r) * factor : ritualScore(r),
      headline: r.message,
      action: r.action,
      reciprocidad: i.reciprocidad,
      fuerza: i.fuerza,
      daysSinceContact: i.daysSinceContact,
      daysUntil: r.daysUntil,
      canGenerateMessage: true,
    })
  }

  // 3. Una tarjeta por persona: la de mayor score gana.
  candidates.sort((a, b) => b.score - a.score)
  const seen = new Set<string>()
  const unique: DailyAction[] = []
  for (const c of candidates) {
    if (seen.has(c.personId)) continue
    seen.add(c.personId)
    unique.push(c)
  }

  return unique.slice(0, limit)
}
