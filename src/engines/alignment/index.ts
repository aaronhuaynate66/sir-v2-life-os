// SIR V2 — Alignment Engine (Etapa 4: Identity & Alignment) — MVP
//
// Detecta la BRECHA entre los objetivos DECLARADOS del usuario y su
// COMPORTAMIENTO OBSERVADO. Ejemplo del roadmap: objetivo "ser mejor pareja"
// + señales observadas (menos contacto, relación en tensión) → "tu
// comportamiento reciente no acompaña la relación que decís querer construir".
//
// MVP — alcance honesto y DETERMINÍSTICO:
//   - Sólo objetivos con vínculo ESTRUCTURADO a personas (goal.relatedPersons).
//     Ahí tenemos señales observables reales en los stores: frecuencia de
//     contacto (lastContact), estado de la relación (status) e impacto
//     energético (energyImpact).
//   - Objetivo sin vínculo o sin señales recientes → 'insufficient_data'.
//     NUNCA inventamos una brecha (principio #5: correlación ≠ causa; sin
//     diagnóstico). La inferencia de dominio/persona por LLM para texto libre
//     queda como siguiente paso de Etapa 4.
//
// El "veredicto" (state) se apoya SÓLO en datos reales. La capa narrativa
// (Anthropic, opcional) sólo REFORMULA estas señales en tono reflexivo; no
// decide la brecha.
//
// Puro y determinístico: `now` inyectable. Sin red, sin Date.now() implícito
// en la lógica de clasificación.

import type { Goal, GoalCategory, Person, Relationship } from '@/types'

export type AlignmentState = 'aligned' | 'drifting' | 'needs_attention' | 'insufficient_data'

export type SignalKind = 'contact_recency' | 'relationship_status' | 'energy_impact'

/** Nivel de preocupación de una señal: 0 = acompaña, 1 = se desvía, 2 = brecha. */
export type ConcernLevel = 0 | 1 | 2

export interface ObservedSignal {
  kind: SignalKind
  /** Texto legible listo para UI ("Sin contacto hace 38 días"). */
  label: string
  concern: ConcernLevel
  personId: string
  personName: string
}

export interface GoalAlignment {
  goalId: string
  title: string
  category: GoalCategory
  state: AlignmentState
  /** Nombres de las personas vinculadas efectivamente resueltas. */
  linkedPersonNames: string[]
  /** Señales observadas reales (vacío si insufficient_data). */
  signals: ObservedSignal[]
  /** Razón legible del estado o de por qué faltan datos (reflexiva, no culposa). */
  summary: string
}

export interface AlignmentContext {
  people: Person[]
  relationships: Relationship[]
  /** Override de "ahora" para tests. Default: new Date(). */
  now?: Date
}

const DAY_MS = 86_400_000
const CONTACT_DRIFT_DAYS = 14
const CONTACT_ATTENTION_DAYS = 30

const STATE_SUMMARY: Record<Exclude<AlignmentState, 'insufficient_data'>, string> = {
  aligned: 'Tu comportamiento observado acompaña lo que declaraste querer.',
  drifting: 'Algunas señales se están desviando de lo que declaraste querer construir.',
  needs_attention:
    'Tu comportamiento reciente no acompaña lo que declaraste querer construir. Es una observación para reflexionar, no un juicio.',
}

/** Días enteros desde una fecha ISO date-only/timestamp hasta `now`. null si
 *  no hay fecha o es inválida. Negativos (futuro) se tratan como 0. */
function daysSince(iso: string | undefined, now: Date): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((now.getTime() - t) / DAY_MS))
}

function contactSignal(person: Person, now: Date): ObservedSignal | null {
  const days = daysSince(person.lastContact, now)
  if (days === null) return null
  const concern: ConcernLevel = days > CONTACT_ATTENTION_DAYS ? 2 : days > CONTACT_DRIFT_DAYS ? 1 : 0
  const label =
    days === 0
      ? `Contacto hoy con ${person.name}`
      : concern === 0
        ? `Contacto reciente con ${person.name} (hace ${days} días)`
        : `Sin contacto con ${person.name} hace ${days} días`
  return { kind: 'contact_recency', label, concern, personId: person.id, personName: person.name }
}

function statusSignal(person: Person, rel: Relationship | undefined): ObservedSignal | null {
  if (!rel) return null
  const concern: ConcernLevel =
    rel.status === 'strained' || rel.status === 'ended' ? 2 : rel.status === 'dormant' ? 1 : 0
  const label =
    rel.status === 'strained'
      ? `Relación con ${person.name} en tensión`
      : rel.status === 'ended'
        ? `Relación con ${person.name} terminada`
        : rel.status === 'dormant'
          ? `Relación con ${person.name} dormida`
          : `Relación con ${person.name} activa`
  return { kind: 'relationship_status', label, concern, personId: person.id, personName: person.name }
}

function energySignal(person: Person): ObservedSignal | null {
  // Sólo agregamos señal cuando aporta lectura: drena (preocupa) o energiza
  // (acompaña). 'neutral' no aporta señal de alineación.
  if (person.energyImpact === 'draining') {
    return { kind: 'energy_impact', label: `El vínculo con ${person.name} te drena energía`, concern: 1, personId: person.id, personName: person.name }
  }
  if (person.energyImpact === 'energizing') {
    return { kind: 'energy_impact', label: `El vínculo con ${person.name} te energiza`, concern: 0, personId: person.id, personName: person.name }
  }
  return null
}

function stateFromSignals(signals: ObservedSignal[]): Exclude<AlignmentState, 'insufficient_data'> {
  const worst = signals.reduce<ConcernLevel>((max, s) => (s.concern > max ? s.concern : max), 0)
  return worst === 2 ? 'needs_attention' : worst === 1 ? 'drifting' : 'aligned'
}

/**
 * Alineación de UN objetivo. Determinístico.
 *
 * @param goal Objetivo (idealmente activo; el caller filtra).
 * @param ctx people + relationships del usuario + `now` opcional.
 */
export function computeGoalAlignment(goal: Goal, ctx: AlignmentContext): GoalAlignment {
  const now = ctx.now ?? new Date()
  const base = { goalId: goal.id, title: goal.title, category: goal.category }

  const linkedPeople = goal.relatedPersons
    .map((id) => ctx.people.find((p) => p.id === id))
    .filter((p): p is Person => Boolean(p))

  if (linkedPeople.length === 0) {
    return {
      ...base,
      state: 'insufficient_data',
      linkedPersonNames: [],
      signals: [],
      summary:
        'Vinculá personas a este objetivo para ver señales de alineación con tu comportamiento.',
    }
  }

  const signals: ObservedSignal[] = []
  for (const person of linkedPeople) {
    const rel = ctx.relationships.find((r) => r.personId === person.id)
    const c = contactSignal(person, now)
    const s = statusSignal(person, rel)
    const e = energySignal(person)
    if (c) signals.push(c)
    if (s) signals.push(s)
    if (e) signals.push(e)
  }

  const linkedPersonNames = linkedPeople.map((p) => p.name)

  if (signals.length === 0) {
    return {
      ...base,
      state: 'insufficient_data',
      linkedPersonNames,
      signals: [],
      summary:
        'Faltan señales recientes (sin fecha de contacto ni estado de relación registrado) para leer la alineación.',
    }
  }

  const state = stateFromSignals(signals)
  return { ...base, state, linkedPersonNames, signals, summary: STATE_SUMMARY[state] }
}

/**
 * Alineación de todos los objetivos ACTIVOS, ordenada por urgencia
 * (needs_attention → drifting → aligned → insufficient_data).
 */
export function computeAlignments(goals: Goal[], ctx: AlignmentContext): GoalAlignment[] {
  const order: Record<AlignmentState, number> = {
    needs_attention: 0,
    drifting: 1,
    aligned: 2,
    insufficient_data: 3,
  }
  return goals
    .filter((g) => g.status === 'active')
    .map((g) => computeGoalAlignment(g, ctx))
    .sort((a, b) => order[a.state] - order[b.state])
}
