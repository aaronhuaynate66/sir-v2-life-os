// SIR V2 — Timeline unificado cross-fuente (AF·F1, cluster auto-forense).
//
// "Pathfinder apuntado a TU propia vida": fusiona eventos de varias fuentes de
// SIR (finanzas, ánimo, sueño, salud, eventos externos, gente…) en UNA sola línea
// de tiempo explorable, agrupada por día de Lima. PURO y determinístico — el
// caller normaliza cada fuente a `TimelineItem`; este módulo ordena, agrupa,
// etiqueta y filtra. No es vigilancia: es tu vida en una línea, para verte.

import { limaDayKey } from '@/lib/dates/limaDay'

export type TimelineSource = 'finanzas' | 'animo' | 'sueno' | 'salud' | 'evento' | 'persona' | 'objetivo' | 'recordatorio'
export type TimelineTone = 'ok' | 'warn' | 'bad' | 'neutral'

export interface TimelineItem {
  id: string
  /** ISO (con o sin hora) o YYYY-MM-DD. Se reduce al día de Lima. */
  date: string
  source: TimelineSource
  title: string
  detail?: string
  tone?: TimelineTone
}

export interface TimelineDay {
  dayKey: string
  label: string
  items: TimelineItem[]
}

export interface UnifiedTimeline {
  days: TimelineDay[]
  /** Fuentes presentes en el set (para armar el filtro). */
  sources: TimelineSource[]
  total: number
}

interface BuildOpts {
  todayKey: string
  /** Si se pasa, solo estas fuentes. */
  only?: TimelineSource[]
  /** Máximo de días a devolver (los más recientes). */
  maxDays?: number
}

const MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Etiqueta del día relativa a hoy: "hoy" / "ayer" / "3 jul". */
export function dayLabel(dayKey: string, todayKey: string): string {
  if (dayKey === todayKey) return 'hoy'
  const d = daysBetween(dayKey, todayKey)
  if (d === 1) return 'ayer'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dayKey)
  if (!m) return dayKey
  return `${Number(m[3])} ${MON[Number(m[2]) - 1] ?? ''}`.trim()
}

function daysBetween(a: string, b: string): number {
  const ta = keyToMs(a); const tb = keyToMs(b)
  if (ta == null || tb == null) return 0
  return Math.round((tb - ta) / 86_400_000)
}
function keyToMs(k: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(k ?? '')
  if (!m) return null
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
  return Number.isFinite(t) ? t : null
}

/** Reduce el `date` de un item al día de Lima (YYYY-MM-DD). */
function itemDayKey(date: string): string | null {
  if (date.includes('T')) return limaDayKey(date)
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(date ?? '')
  return m ? m[1] : null
}

/**
 * Fusiona items en una línea de tiempo agrupada por día (desc). Determinístico.
 */
export function buildUnifiedTimeline(items: TimelineItem[], opts: BuildOpts): UnifiedTimeline {
  const only = opts.only && opts.only.length > 0 ? new Set(opts.only) : null
  const filtered = only ? items.filter((i) => only.has(i.source)) : items

  const byDay = new Map<string, TimelineItem[]>()
  const presentSources = new Set<TimelineSource>()
  for (const it of items) presentSources.add(it.source) // fuentes = sobre TODO el set (para el filtro)

  for (const it of filtered) {
    const day = itemDayKey(it.date)
    if (!day) continue
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day)!.push(it)
  }

  let days: TimelineDay[] = [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0)) // día desc
    .map(([dayKey, dayItems]) => ({
      dayKey,
      label: dayLabel(dayKey, opts.todayKey),
      // Dentro del día: por fuente (orden estable) y luego por título.
      items: [...dayItems].sort((a, b) => a.source.localeCompare(b.source) || a.title.localeCompare(b.title)),
    }))

  if (opts.maxDays && opts.maxDays > 0) days = days.slice(0, opts.maxDays)

  const total = days.reduce((n, d) => n + d.items.length, 0)
  return { days, sources: [...presentSources].sort(), total }
}
