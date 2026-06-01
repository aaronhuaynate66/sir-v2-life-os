// SIR V2 — Timeline operativo del día (P6), lógica pura.
//
// Toma los eventos del calendario (ya parseados/normalizados por ics.ts) y
// arma la vista operativa de HOY (en TZ Lima): bloques ordenados, bloque
// actual y próximo, tiempo a la próxima transición, y detección de sobrecarga.
//
// Determinístico: `nowMs` se inyecta. Sin red. TZ Lima (UTC-5 fijo) vía
// toLimaDateOnly (consistente con el parser).

import { toLimaDateOnly } from './ics'
import type { CalendarEvent } from './types'

const DEFAULT_BLOCK_MIN = 60

export type BlockStatus = 'past' | 'current' | 'upcoming'

export interface TimelineBlock {
  event: CalendarEvent
  startMs: number
  endMs: number
  status: BlockStatus
}

export type OverloadLevel = 'ok' | 'busy' | 'overloaded'

export interface OverloadInfo {
  level: OverloadLevel
  blockCount: number
  /** Horas ocupadas (suma de duraciones de bloques con hora). */
  busyHours: number
  reason: string
}

export interface DayTimeline {
  /** 'YYYY-MM-DD' (Lima) del día representado. */
  dateKey: string
  /** Bloques con hora de hoy, ordenados por inicio. */
  blocks: TimelineBlock[]
  /** Eventos all-day de hoy. */
  allDay: CalendarEvent[]
  current: TimelineBlock | null
  next: TimelineBlock | null
  /** ms hasta la próxima transición: fin del actual, o inicio del próximo. null si no hay. */
  msToNextTransition: number | null
  overload: OverloadInfo
}

function blockBounds(ev: CalendarEvent): { startMs: number; endMs: number } {
  const startMs = Date.parse(ev.start)
  const endMs = ev.end ? Date.parse(ev.end) : startMs + DEFAULT_BLOCK_MIN * 60_000
  // Defensa: si end <= start (dato raro), forzamos al menos el bloque default.
  return { startMs, endMs: endMs > startMs ? endMs : startMs + DEFAULT_BLOCK_MIN * 60_000 }
}

function computeOverload(blocks: TimelineBlock[]): OverloadInfo {
  const blockCount = blocks.length
  const busyMs = blocks.reduce((s, b) => s + (b.endMs - b.startMs), 0)
  const busyHours = Math.round((busyMs / 3_600_000) * 10) / 10

  let level: OverloadLevel = 'ok'
  let reason = 'Día con espacio.'
  if (blockCount >= 6 || busyHours >= 9) {
    level = 'overloaded'
    reason = `Día sobrecargado: ${blockCount} bloques, ${busyHours} h ocupadas. Protegé tiempo de recuperación.`
  } else if (blockCount >= 4 || busyHours >= 6) {
    level = 'busy'
    reason = `Día cargado: ${blockCount} bloques, ${busyHours} h. Dejá huecos para respirar.`
  }
  return { level, blockCount, busyHours, reason }
}

/**
 * Arma el timeline operativo de HOY (el día Lima de `nowMs`).
 * Solo considera eventos que ocurren hoy.
 */
export function buildDayTimeline(events: CalendarEvent[], nowMs: number): DayTimeline {
  const dateKey = toLimaDateOnly(nowMs)

  const allDay: CalendarEvent[] = []
  const timed: TimelineBlock[] = []

  for (const ev of events) {
    if (ev.allDay) {
      if (ev.start === dateKey) allDay.push(ev)
      continue
    }
    const startMs = Date.parse(ev.start)
    if (Number.isNaN(startMs)) continue
    if (toLimaDateOnly(startMs) !== dateKey) continue // no es de hoy
    const { endMs } = blockBounds(ev)
    const status: BlockStatus = nowMs >= endMs ? 'past' : nowMs >= startMs ? 'current' : 'upcoming'
    timed.push({ event: ev, startMs, endMs, status })
  }

  timed.sort((a, b) => a.startMs - b.startMs)

  const current = timed.find((b) => b.status === 'current') ?? null
  const next = timed.find((b) => b.status === 'upcoming') ?? null

  let msToNextTransition: number | null = null
  if (current) msToNextTransition = current.endMs - nowMs
  else if (next) msToNextTransition = next.startMs - nowMs

  return {
    dateKey,
    blocks: timed,
    allDay,
    current,
    next,
    msToNextTransition,
    overload: computeOverload(timed),
  }
}
