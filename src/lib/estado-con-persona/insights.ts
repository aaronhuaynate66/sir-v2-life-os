// SIR V2 — Insights determinísticos de "Cómo estás con [Persona]".
//
// Sintetiza en pocos datos concretos el estado con una persona, cruzando lo
// que ya tenemos cargado en la ficha: person_logs (tono de interacciones),
// relationship_moments (episodios abiertos/resueltos), person_cycles (fase
// del día si aplica), memorias recientes. Todo PURO, sin LLM, sin red.
//
// Filosofía: reflejar hechos + patrones simples, no diagnosticar. "El tono
// bajó en las últimas 3 interacciones" es un hecho; "estás distanciándote"
// es diagnóstico y NO va acá — para eso está la síntesis IA opcional.

import type { PersonLog } from '@/lib/person-logs/types'
import type { RelationshipMoment } from '@/lib/moments/types'
import type { PersonCycleEntry, CyclePhase } from '@/lib/person-cycles/types'
import type { Memory } from '@/types'
import { urgencyOf, type Urgency } from '@/lib/moments/urgency'
import { limaDayKey } from '@/lib/dates/limaDay'

export interface EstadoInsights {
  /** Fecha de la última interacción (ISO), o null si nunca hubo. */
  lastInteractionAt: string | null
  /** Valor 1..5 de la última interacción, null si no hay. */
  lastInteractionValue: number | null
  /** Días desde la última interacción (0 = hoy). null si no hay logs. */
  daysSinceLast: number | null

  /** Promedio del tono de las últimas N interacciones. null si <2 logs. */
  recentAvg: number | null
  /** Promedio de las N interacciones ANTERIORES a las recientes. */
  previousAvg: number | null
  /** recentAvg - previousAvg. Positivo = mejorando; negativo = empeorando. */
  toneDelta: number | null

  /** Cuántos moments abiertos hay con esta persona. */
  openMomentsCount: number
  /** Cantidad overdue (follow-up ya pasó). */
  overdueCount: number
  /** El más urgente (por rank). null si no hay abiertos. */
  mostUrgent: { title: string; urgency: Urgency; deltaDays: number | null } | null

  /** Fase del ciclo REGISTRADA para hoy (si hay entry). null si no aplica. */
  todayCyclePhase: CyclePhase | null
  /** ¿Hay data suficiente de ciclo para que el bucket signifique algo? */
  cycleDataAvailable: boolean

  /** N memorias más recientes en las últimas ~60 días. */
  recentMemoryCount: number
  /** Título de la memoria más reciente (para "Última cosa que aprendí"). */
  latestMemoryTitle: string | null

  /** Etiqueta general 1-palabra: "cerca" | "distante" | "en tensión" | "estable" | "sin_data". */
  overallLabel: EstadoLabel
}

export type EstadoLabel = 'cerca' | 'distante' | 'en_tension' | 'estable' | 'sin_data'

const RECENT_WINDOW = 3
const MEMORY_WINDOW_DAYS = 60
const DAY_MS = 86_400_000

function daysBetweenIsos(fromIso: string, nowMs: number): number {
  const t = new Date(fromIso).getTime()
  if (Number.isNaN(t)) return Infinity
  return Math.floor((nowMs - t) / DAY_MS)
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function round1(n: number | null): number | null {
  return n == null ? null : Math.round(n * 10) / 10
}

/** Deriva la etiqueta general del vínculo del set de indicadores. */
function deriveLabel(input: {
  daysSinceLast: number | null
  recentAvg: number | null
  toneDelta: number | null
  openMomentsCount: number
  overdueCount: number
}): EstadoLabel {
  if (input.daysSinceLast == null && input.recentAvg == null) return 'sin_data'
  // Tensión: hay overdue O tono muy bajo.
  if (input.overdueCount > 0) return 'en_tension'
  if (input.recentAvg != null && input.recentAvg <= 2.3) return 'en_tension'
  // Distante: mucho tiempo sin contacto Y sin momentos abiertos que fuercen encuentro.
  if (input.daysSinceLast != null && input.daysSinceLast >= 21 && input.openMomentsCount === 0) return 'distante'
  // Cerca: tono alto + delta positivo o estable.
  if (input.recentAvg != null && input.recentAvg >= 4 && (input.toneDelta ?? 0) >= 0) return 'cerca'
  return 'estable'
}

export interface BuildInsightsInput {
  personLogs: PersonLog[]
  moments: RelationshipMoment[]
  personCycles: PersonCycleEntry[]
  memories: Memory[]
  now: Date
}

/**
 * Calcula todos los insights determinísticos. PURO — todos los inputs se
 * inyectan; el `now` también (para tests reproducibles).
 */
export function buildEstadoInsights(input: BuildInsightsInput): EstadoInsights {
  const { personLogs, moments, personCycles, memories, now } = input
  const nowMs = now.getTime()
  // Día de HOY en Lima (offset fijo), NO en la TZ del proceso. Con ymdLocal, un
  // `now` de las 20:00 de Lima (01:00 UTC) caía "mañana" en un runner UTC (CI) →
  // el cruce con la fecha del cycle entry fallaba y el test flakeaba, bloqueando
  // el runner de migraciones. limaDayKey es determinístico en cualquier TZ.
  const todayYmd = limaDayKey(now.toISOString()) ?? now.toISOString().slice(0, 10)

  // ─── Última interacción y tono reciente ─────────────────────────────
  const interactions = personLogs
    .filter((l) => l.kind === 'interaction' && Number.isFinite(l.value) && l.value > 0)
    .slice()
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))

  const last = interactions[0] ?? null
  const lastInteractionAt = last?.loggedAt ?? null
  const lastInteractionValue = last?.value ?? null
  const daysSinceLast = last ? daysBetweenIsos(last.loggedAt, nowMs) : null

  const recent = interactions.slice(0, RECENT_WINDOW).map((l) => l.value)
  const previous = interactions.slice(RECENT_WINDOW, RECENT_WINDOW * 2).map((l) => l.value)
  const recentAvg = round1(avg(recent))
  const previousAvg = round1(avg(previous))
  const toneDelta = recentAvg != null && previousAvg != null ? round1(recentAvg - previousAvg) : null

  // ─── Moments abiertos + urgencia ────────────────────────────────────
  const open = moments.filter((m) => m.status === 'abierto')
  const withUrgency = open.map((m) => {
    const { urgency, deltaDays } = urgencyOf(m.followUpOn, todayYmd)
    return { moment: m, urgency, deltaDays }
  })
  const overdueCount = withUrgency.filter((x) => x.urgency === 'overdue').length
  const rank: Record<Urgency, number> = { overdue: 0, dueSoon: 1, later: 2, sinFecha: 3 }
  const mostUrgent = withUrgency.length > 0
    ? withUrgency.slice().sort((a, b) => rank[a.urgency] - rank[b.urgency])[0]
    : null

  // ─── Ciclo del día (si aplica) ──────────────────────────────────────
  const todayEntry = personCycles.find((c) => c.date === todayYmd) ?? null
  const cycleDataAvailable = personCycles.length >= 3

  // ─── Memorias recientes ─────────────────────────────────────────────
  const memoryCutoff = nowMs - MEMORY_WINDOW_DAYS * DAY_MS
  const recentMemories = memories
    .filter((m) => new Date(m.timestamp).getTime() >= memoryCutoff)
    .slice()
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  const latestMemoryTitle = recentMemories[0]?.title ?? null

  const overallLabel = deriveLabel({
    daysSinceLast,
    recentAvg,
    toneDelta,
    openMomentsCount: open.length,
    overdueCount,
  })

  return {
    lastInteractionAt,
    lastInteractionValue,
    daysSinceLast,
    recentAvg,
    previousAvg,
    toneDelta,
    openMomentsCount: open.length,
    overdueCount,
    mostUrgent: mostUrgent
      ? { title: mostUrgent.moment.title, urgency: mostUrgent.urgency, deltaDays: mostUrgent.deltaDays }
      : null,
    todayCyclePhase: todayEntry?.phase ?? null,
    cycleDataAvailable,
    recentMemoryCount: recentMemories.length,
    latestMemoryTitle,
    overallLabel,
  }
}

/** Etiqueta humana con emoji-friendly para la UI. */
export const LABEL_HUMAN: Record<EstadoLabel, { label: string; description: string; toneClass: string }> = {
  cerca: {
    label: 'Cerca',
    description: 'Interacciones recientes con tono alto o subiendo. Está viniendo cálido — buen momento para estar cerca.',
    toneClass: 'text-ok border-ok/40 bg-ok-soft',
  },
  estable: {
    label: 'Estable',
    description: 'Sin señales de tensión. Mantener el ritmo.',
    toneClass: 'text-muted-foreground border-border bg-muted/40',
  },
  en_tension: {
    label: 'En tensión',
    description: 'Hay temas abiertos o el tono viene bajo. Atender pronto.',
    toneClass: 'text-bad border-bad/40 bg-bad-soft',
  },
  distante: {
    label: 'Distante',
    description: 'Hace tiempo sin contacto significativo. Considerá si querés reconectar.',
    toneClass: 'text-warn border-warn/40 bg-warn-soft',
  },
  sin_data: {
    label: 'Sin data',
    description: 'Todavía no hay suficientes registros para leer el estado.',
    toneClass: 'text-muted-foreground/70 border-border/40 bg-muted/20',
  },
}
