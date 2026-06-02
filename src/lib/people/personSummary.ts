// SIR V2 — Síntesis de cabecera de la ficha de persona (lógica pura).
//
// V1 abría la persona con una franja que se leía de un vistazo: fase del ciclo,
// cumpleaños/aniversario próximo, última interacción, score del vínculo y UNA
// línea de próxima acción accionable. V2 tenía toda esa data dispersa en cards
// separadas; este módulo la SINTETIZA en un solo objeto para la franja de
// resumen (ResumenPersona), sin re-implementar nada:
//
//   - cyclePhase (lib/ciclo/phase): fase + días al próximo período.
//   - contactDatesInRange (lib/horario/cockpit): próxima fecha de la red
//     (cumpleaños/aniversario) con su nudge accionable ya calibrado por
//     lead-time. Una sola fuente de verdad para countdowns + empujones.
//   - relativeEs (lib/graph/hover): tiempo relativo compacto en español.
//   - computeRelationalScore / healthBand (lib/people/relationalScore): score.
//
// La "próxima acción" prioriza: fecha próxima de la red > contacto frío >
// sin contacto registrado. El umbral de "frío" sale de la importancia (los
// vínculos importantes se enfrían antes). PURA + determinística (`now`
// inyectable) → tests TZ-independientes.

import type { Person } from '@/types'
import { cyclePhase } from '@/lib/ciclo/phase'
import { contactDatesInRange } from '@/lib/horario/cockpit'
import { relativeEs } from '@/lib/graph/hover'
import {
  computeRelationalScore,
  healthBand,
  type HealthBand,
} from './relationalScore'

const DAY_MS = 86_400_000

/** Ventana (días) para considerar una fecha de la red "próxima" en la franja.
 *  ~2 meses: lo bastante ancho para anticipar, sin mostrar fechas lejanas. */
const NEXT_DATE_LEAD_DAYS = 60

export interface SummaryCycle {
  /** "Folicular", "Lútea", etc. */
  label: string
  /** Día del ciclo (1-based). */
  cycleDay: number
  /** Días hasta el próximo período. */
  daysUntilNextPeriod: number
  /** true si el período llega dentro de 3 días (semántico de urgencia suave). */
  periodSoon: boolean
}

export interface SummaryNextDate {
  kind: 'birthday' | 'special_date'
  /** Título corto ("Cumpleaños", o la etiqueta de la fecha especial). */
  label: string
  daysUntil: number
  /** Empujón accionable ya calibrado (de contactDatesInRange). */
  nudge: string
}

export interface SummaryLastInteraction {
  iso: string
  /** "hace 3d", "ayer", "hace 2sem". */
  relative: string
  /** Días enteros desde la interacción. */
  days: number
}

export interface SummaryScore {
  global: number
  fuerza: number
  confianza: number
  band: HealthBand
}

export type NextActionUrgency = 'info' | 'soon' | 'now'

export interface SummaryNextAction {
  text: string
  urgency: NextActionUrgency
}

export interface PersonSummary {
  cycle: SummaryCycle | null
  nextDate: SummaryNextDate | null
  lastInteraction: SummaryLastInteraction | null
  score: SummaryScore
  nextAction: SummaryNextAction | null
}

export interface PersonSummaryInput {
  person: Person
  /** observed_at ISO del último whatsapp_chat curado (conversación real). */
  lastChatObservedAt: string | null
  /** logged_at ISO del último person_log kind='interaction' (registro manual). */
  lastManualInteractionAt: string | null
}

/** Umbral de "contacto frío" en días, según la importancia del vínculo: los
 *  vínculos importantes se consideran fríos antes (importancia 10 → 7 días,
 *  importancia 1 → ~21 días). */
function staleThresholdDays(importanceScore: number): number {
  const imp = Math.max(1, Math.min(10, Number(importanceScore) || 5))
  // 10 → 7, 5 → ~14, 1 → 21. Lineal descendente con la importancia.
  return Math.round(21 - (imp - 1) * (14 / 9))
}

/** El instante más reciente entre chat real y registro manual (ms), o null. */
function latestInteractionMs(chatIso: string | null, manualIso: string | null): {
  iso: string
  ms: number
} | null {
  const chat = chatIso ? Date.parse(chatIso) : NaN
  const manual = manualIso ? Date.parse(manualIso) : NaN
  const chatOk = Number.isFinite(chat)
  const manualOk = Number.isFinite(manual)
  if (!chatOk && !manualOk) return null
  if (chatOk && (!manualOk || chat >= manual)) return { iso: chatIso as string, ms: chat }
  return { iso: manualIso as string, ms: manual }
}

export function buildPersonSummary(
  input: PersonSummaryInput,
  now: Date = new Date(),
): PersonSummary {
  const { person } = input

  // ─── Ciclo (si la persona lo trackea) ───────────────────────────────
  let cycle: SummaryCycle | null = null
  if (person.cycleStartDate) {
    const cp = cyclePhase(person.cycleStartDate, person.cycleLengthDays ?? 28, now)
    if (cp) {
      cycle = {
        label: cp.label,
        cycleDay: cp.cycleDay,
        daysUntilNextPeriod: cp.daysUntilNextPeriod,
        periodSoon: cp.daysUntilNextPeriod <= 3,
      }
    }
  }

  // ─── Próxima fecha de la red (reusa contactDatesInRange para 1 persona) ─
  const dates = contactDatesInRange([person], NEXT_DATE_LEAD_DAYS, now)
  const nearest = dates[0]
  const nextDate: SummaryNextDate | null = nearest
    ? {
        kind: nearest.kind,
        label: nearest.kind === 'birthday' ? 'Cumpleaños' : nearest.title.split(' · ')[0],
        daysUntil: nearest.daysUntil,
        nudge: nearest.nudge,
      }
    : null

  // ─── Última interacción ──────────────────────────────────────────────
  const latest = latestInteractionMs(input.lastChatObservedAt, input.lastManualInteractionAt)
  const lastInteraction: SummaryLastInteraction | null = latest
    ? {
        iso: latest.iso,
        relative: relativeEs(latest.iso, now),
        days: Math.max(0, Math.floor((now.getTime() - latest.ms) / DAY_MS)),
      }
    : null

  // ─── Score del vínculo ───────────────────────────────────────────────
  const breakdown = computeRelationalScore(
    {
      importanceScore: person.importanceScore,
      trustLevel: person.trustLevel,
      lastChatObservedAt: input.lastChatObservedAt,
    },
    now,
  )
  const score: SummaryScore = {
    global: breakdown.global,
    fuerza: breakdown.fuerza,
    confianza: breakdown.confianza,
    band: healthBand(breakdown.global),
  }

  // ─── Próxima acción (prioridad: fecha próxima > contacto frío > sin contacto) ─
  const nextAction = computeNextAction({ person, nextDate, lastInteraction })

  return { cycle, nextDate, lastInteraction, score, nextAction }
}

function pluralDias(n: number): string {
  const abs = Math.abs(n)
  return `${abs} día${abs === 1 ? '' : 's'}`
}

function computeNextAction(args: {
  person: Person
  nextDate: SummaryNextDate | null
  lastInteraction: SummaryLastInteraction | null
}): SummaryNextAction | null {
  const { person, nextDate, lastInteraction } = args

  // 1. Fecha próxima de la red (cumpleaños/aniversario) dentro de ~1 mes.
  if (nextDate && nextDate.daysUntil <= 30) {
    const when =
      nextDate.daysUntil === 0
        ? 'hoy'
        : nextDate.daysUntil === 1
          ? 'mañana'
          : `en ${pluralDias(nextDate.daysUntil)}`
    const label = nextDate.kind === 'birthday' ? 'Cumple' : nextDate.label
    return {
      text: `${label} ${when} → ${nextDate.nudge.toLowerCase()}`,
      urgency: nextDate.daysUntil <= 2 ? 'now' : 'soon',
    }
  }

  // 2. Contacto frío: pasó el umbral (según importancia) desde la última interacción.
  const threshold = staleThresholdDays(person.importanceScore)
  if (lastInteraction && lastInteraction.days >= threshold) {
    return {
      text: `${pluralDias(lastInteraction.days)} sin hablar → escribile`,
      urgency: lastInteraction.days >= threshold * 2 ? 'now' : 'soon',
    }
  }

  // 3. Nunca hubo interacción registrada y tampoco un último contacto manual.
  if (!lastInteraction && !person.lastContact) {
    return {
      text: 'Sin contacto registrado → registrá una interacción',
      urgency: 'info',
    }
  }

  // Vínculo reciente / al día: sin empujón.
  return null
}
