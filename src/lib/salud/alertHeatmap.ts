// SIR V2 — Helper PURO para el mapa de calor de alertas de FC elevada.
// Convierte filas health_metrics (type 'heart_rate_high_alerts') en una grilla
// estilo calendario (semanas × días, lunes→domingo) de las últimas N semanas,
// + un resumen. Sin React/DOM → testeable.

import type { HealthMetric } from '@/types'

export interface AlertDay {
  /** 'YYYY-MM-DD' del día. */
  iso: string
  /** Conteo de alertas ese día (0 si no hubo). */
  count: number
  /** ¿Cae dentro de la ventana mostrada? (para días de relleno al borde). */
  inRange: boolean
}

export interface AlertCalendar {
  /** weeks[semana][díaDeLaSemana 0=lunes..6=domingo]. */
  weeks: AlertDay[][]
  /** Etiqueta de mes por columna (vacía si repite el mes de la columna previa). */
  monthLabels: string[]
  summary: {
    totalDays: number
    totalAlerts: number
    busiestIso: string | null
    busiestCount: number
  }
}

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function dayISO(d: Date): string {
  return d.toISOString().slice(0, 10)
}
/** Día de la semana con lunes=0 … domingo=6. */
function mondayIndex(d: Date): number {
  return (d.getUTCDay() + 6) % 7
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000)
}

/**
 * Construye el calendario de alertas. `todayISO` = hoy ('YYYY-MM-DD'),
 * `weeks` = cuántas semanas mostrar (default 12, incluida la actual).
 */
export function buildAlertCalendar(
  metrics: HealthMetric[],
  todayISO: string,
  weeks = 12,
): AlertCalendar {
  // Conteo por día (suma defensiva si hubiera más de una fila por día).
  const byDay = new Map<string, number>()
  for (const m of metrics) {
    if (m.type !== 'heart_rate_high_alerts') continue
    const iso = (m.timestamp ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue
    byDay.set(iso, (byDay.get(iso) ?? 0) + (Number(m.value) || 0))
  }

  // Resumen sobre TODA la data (no solo la ventana visible).
  let totalAlerts = 0
  let busiestIso: string | null = null
  let busiestCount = 0
  for (const [iso, count] of byDay) {
    totalAlerts += count
    if (count > busiestCount) { busiestCount = count; busiestIso = iso }
  }

  // Ventana: lunes de la semana actual, hacia atrás (weeks-1) semanas.
  const today = new Date(`${todayISO}T00:00:00.000Z`)
  const startMonday = addDays(today, -(mondayIndex(today) + (weeks - 1) * 7))

  const grid: AlertDay[][] = []
  const monthLabels: string[] = []
  let prevMonth = -1
  for (let w = 0; w < weeks; w++) {
    const col: AlertDay[] = []
    const colStart = addDays(startMonday, w * 7)
    const m = colStart.getUTCMonth()
    monthLabels.push(m !== prevMonth ? MONTHS_ES[m] : '')
    prevMonth = m
    for (let d = 0; d < 7; d++) {
      const day = addDays(colStart, d)
      const iso = dayISO(day)
      col.push({ iso, count: byDay.get(iso) ?? 0, inRange: day.getTime() <= today.getTime() })
    }
    grid.push(col)
  }

  return {
    weeks: grid,
    monthLabels,
    summary: { totalDays: byDay.size, totalAlerts, busiestIso, busiestCount },
  }
}
