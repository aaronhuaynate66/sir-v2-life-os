// SIR V2 — Urgencia de contacto (GEMA A, lógica pura, portada de SIR v1).
//
// V1 puntuaba a QUIÉN contactar hoy con una fórmula multifactor
// (`acciones/generate.ts` + `advisor/route.ts`):
//
//   overdueScore  = min(100, (daysSince/freq ?? 1.5) * 50)
//   relScore      = strength*0.4 + reciprocity*0.3 + trust*100*0.3
//   healthNeed    = 100 - relScore
//   stageUrgency  = {dormant:80, prospect:50, active:20, strategic:15}
//   score = round(overdue*0.4 + healthNeed*0.3 + stage*0.3)
//           + 30 (si hay fecha próxima) + 10 (si hay señal reciente)
//   urgency = score>=65 high : >=40 medium : low
//
// Acá la portamos al modelo de V2:
//   - strength  → `fuerza`     (relationalScore: importance*10 ± recencia)
//   - reciprocity → `reciprocidad` (relationalScore GEMA C; null → 50 neutral)
//   - trust*100 → `confianza`  (relationalScore: trust*10)
//   - stage     → derivado de relationship.status + people.category (V2 no
//                 tiene un campo `stage`; ver `stageUrgency`).
//   - contact_frequency_days (número en V1) → V2 guarda texto libre en
//     people.contact_frequency; `contactFrequencyDays` lo parsea con fallback
//     por categoría.
//
// PURA + determinística: sin I/O, sin Date.now() interno. Testeable.

import type { PersonCategory, RelationshipStatus } from '@/types'

/** Urgencia por "stage" del vínculo. V1 usaba un enum stage (dormant/prospect/
 *  active/strategic); V2 no lo tiene, así que lo derivamos de status + category:
 *  un vínculo dormido o tenso urge re-engancharlo; dentro de los activos, los
 *  periféricos/red urgen más que el círculo íntimo (que ya está cuidado). */
export function stageUrgency(
  category: PersonCategory,
  status: RelationshipStatus | undefined,
): number {
  if (status === 'dormant') return 80 // hay que reactivar antes de que cueste
  if (status === 'strained') return 70 // tensión sin resolver = riesgo
  // status 'active' (o sin relación registrada): por cercanía deseada.
  switch (category) {
    case 'peripheral':
      return 50 // como el "prospect" de v1: cultivar o dejar ir
    case 'network':
      return 40
    case 'close':
      return 20
    case 'inner_circle':
      return 15 // como "strategic": importa, pero suele estar al día
    default:
      return 30
  }
}

/** Frecuencia objetivo de contacto por categoría cuando no hay texto que parsear. */
const DEFAULT_FREQ_BY_CATEGORY: Record<PersonCategory, number> = {
  inner_circle: 7,
  close: 14,
  network: 30,
  peripheral: 60,
}

const FREQ_KEYWORDS: Array<{ re: RegExp; days: number }> = [
  { re: /\b(diari|daily|cada d[ií]a|todos los d[ií]as)/, days: 1 },
  { re: /\b(quincenal|biweekly|cada (dos|2) semanas)/, days: 14 },
  { re: /\b(semanal|weekly|cada semana)/, days: 7 },
  { re: /\b(mensual|monthly|cada mes)/, days: 30 },
  { re: /\b(bimestral|cada (dos|2) meses)/, days: 60 },
  { re: /\b(trimestral|quarterly|cada (tres|3) meses)/, days: 90 },
  { re: /\b(semestral|cada (seis|6) meses)/, days: 180 },
  { re: /\b(anual|yearly|cada a[nñ]o)/, days: 365 },
]

/**
 * Frecuencia objetivo de contacto en DÍAS. V2 guarda `contact_frequency` como
 * texto libre (ej. "semanal", "cada 10 días", "monthly"). Parseo tolerante:
 *   1. "cada N días/dias/days" → N.
 *   2. palabra clave conocida (semanal, mensual, …).
 *   3. fallback por categoría del vínculo.
 */
export function contactFrequencyDays(
  freqText: string | undefined | null,
  category: PersonCategory,
): number {
  const raw = (freqText ?? '').trim().toLowerCase()
  if (raw) {
    const everyN = raw.match(/cada\s+(\d{1,3})\s*(d[ií]as?|days?)/)
    if (everyN) {
      const n = Number(everyN[1])
      if (Number.isFinite(n) && n > 0) return Math.min(365, n)
    }
    const bareN = raw.match(/^(\d{1,3})\s*(d[ií]as?|days?)?$/)
    if (bareN) {
      const n = Number(bareN[1])
      if (Number.isFinite(n) && n > 0) return Math.min(365, n)
    }
    for (const { re, days } of FREQ_KEYWORDS) {
      if (re.test(raw)) return days
    }
  }
  return DEFAULT_FREQ_BY_CATEGORY[category] ?? 30
}

export interface ContactUrgencyInput {
  /** 0-100, de computeRelationalScore. */
  fuerza: number
  /** 0-100 | null, de computeRelationalScore (GEMA C). null → 50 neutral. */
  reciprocidad: number | null
  /** 0-100, de computeRelationalScore. */
  confianza: number
  category: PersonCategory
  status?: RelationshipStatus
  /** Días desde la última interacción (chat real o registro manual). null = nunca. */
  daysSinceContact: number | null
  /** Frecuencia objetivo en días (de `contactFrequencyDays`). */
  contactFrequencyDays: number
  /** ¿Tiene una fecha de la red (cumple/aniversario) dentro del lead-time? */
  hasUpcomingDate: boolean
  /** Señales recientes (≈30d) ligadas a esta persona. */
  recentSignalCount: number
}

export type UrgencyLevel = 'high' | 'medium' | 'low'

export interface ContactUrgency {
  score: number
  urgency: UrgencyLevel
  reason: string
  components: {
    overdueScore: number
    relScore: number
    healthNeed: number
    stageUrgency: number
  }
}

function round(n: number): number {
  return Math.round(n)
}

/**
 * Puntúa cuán urgente es contactar a una persona HOY. Fórmula portada de v1
 * (overdue 0.4 / healthNeed 0.3 / stage 0.3 + bonus fecha/señal). La razón es
 * la escalera de `acciones/generate.ts`, adaptada a status/category de V2.
 */
export function scoreContactUrgency(input: ContactUrgencyInput): ContactUrgency {
  const freq = input.contactFrequencyDays > 0 ? input.contactFrequencyDays : 30

  // V1 usaba ratio 1.5 cuando nunca hubo contacto (peso alto: un vínculo sin
  // un solo contacto registrado está "vencido" por definición).
  const overdueRatio = input.daysSinceContact !== null ? input.daysSinceContact / freq : 1.5
  const overdueScore = Math.min(100, overdueRatio * 50)

  // Reciprocidad neutral (50) si no hay datos: no castiga ni premia el cálculo.
  const recip = input.reciprocidad ?? 50
  const relScore = round(input.fuerza * 0.4 + recip * 0.3 + input.confianza * 0.3)
  const healthNeed = 100 - relScore

  const stage = stageUrgency(input.category, input.status)

  const priority = overdueScore * 0.4 + healthNeed * 0.3 + stage * 0.3
  let score = round(priority)
  if (input.hasUpcomingDate) score += 30
  if (input.recentSignalCount > 0) score += 10

  const urgency: UrgencyLevel = score >= 65 ? 'high' : score >= 40 ? 'medium' : 'low'

  const reason = buildReason({ ...input, relScore, freq })

  return {
    score,
    urgency,
    reason,
    components: { overdueScore: round(overdueScore), relScore, healthNeed, stageUrgency: stage },
  }
}

function buildReason(
  args: ContactUrgencyInput & { relScore: number; freq: number },
): string {
  const { daysSinceContact: days, freq, relScore, status, hasUpcomingDate, recentSignalCount } = args
  if (hasUpcomingDate) return 'Tiene una fecha importante cerca'
  if (status === 'dormant') return 'Relación dormida — reactivala antes de que cueste'
  if (status === 'strained') return 'Relación tensa — un gesto a tiempo la destensa'
  if (days === null) return 'Sin contacto registrado todavía'
  if (days > freq * 1.5) return `Sin hablar hace ${days} días (meta: cada ${freq})`
  if (days > freq) return `${days - freq} días pasado tu objetivo de contacto`
  if (relScore < 40) return 'Vínculo débil que necesita atención'
  if (recentSignalCount > 0) return 'Señales recientes — buen momento para reforzar'
  return 'Al día — mantené el ritmo'
}
