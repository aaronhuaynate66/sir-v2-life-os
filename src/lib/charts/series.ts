// SIR V2 — Series temporales para charts SVG (Feature 3, lógica pura).
//
// Prepara puntos {date, value} para una viz SVG propia (sin librerías
// pesadas de charting): ordena por fecha, descarta inválidos, escala a
// coordenadas y arma los paths de línea + área.
//
// Determinístico y sin deps. Los adapters de dominio (finanzas / métricas /
// sueño / tono de interacción) mapean entidades del proyecto → SeriesPoint[]
// y delegan en buildLineSeries. La preparación es lo que se testea.
//
// Convención de coordenadas SVG: x crece a la derecha; y crece hacia ABAJO,
// así que invertimos el valor (mayor valor → menor y → más arriba).

import { parseLocalDate } from '@/lib/dates/parseLocalDate'

export interface SeriesPoint {
  /** Fecha date-only o timestamp ISO (se usa el prefijo YYYY-MM-DD). */
  date: string
  value: number
}

export interface PlottedPoint {
  x: number
  y: number
  date: string
  value: number
}

export interface ChartGeometry {
  /** Puntos ya ordenados por fecha y escalados a [padding, size-padding]. */
  points: PlottedPoint[]
  /** Path SVG de la línea ("M x y L x y ..."). '' si no hay puntos. */
  linePath: string
  /** Path SVG del área bajo la línea (cerrada contra el piso). '' si <1. */
  areaPath: string
  width: number
  height: number
  /** Mínimo y máximo de value en la serie (tras filtrar). 0/0 si vacía. */
  min: number
  max: number
  first: SeriesPoint | null
  last: SeriesPoint | null
  /** last.value - first.value. null si <2 puntos. */
  delta: number | null
}

export interface BuildSeriesOptions {
  width?: number
  height?: number
  /** Margen interior en px (deja aire para el stroke). Default 4. */
  padding?: number
}

const DEFAULTS = { width: 240, height: 48, padding: 4 }

function num(n: number): string {
  // Redondeo a 2 decimales para paths compactos y estables en tests.
  return (Math.round(n * 100) / 100).toString()
}

/** Ordena cronológicamente y descarta puntos con fecha inválida o value NaN. */
function cleanAndSort(points: SeriesPoint[]): SeriesPoint[] {
  return points
    .filter((p) => parseLocalDate(p.date) != null && Number.isFinite(p.value))
    .map((p) => ({ point: p, t: parseLocalDate(p.date)!.getTime() }))
    .sort((a, b) => a.t - b.t)
    .map((x) => x.point)
}

/**
 * Construye la geometría de una línea a partir de puntos {date, value}.
 *
 * Casos borde:
 *   - vacío: points [], paths '', min/max 0, delta null.
 *   - 1 punto: lo ubica a la DERECHA (x = ancho útil), centrado en y si no
 *     hay rango; linePath es un único "M"; areaPath ''. delta null.
 *   - todos los valores iguales: línea plana en el centro vertical.
 */
export function buildLineSeries(
  rawPoints: SeriesPoint[],
  opts: BuildSeriesOptions = {},
): ChartGeometry {
  const width = opts.width ?? DEFAULTS.width
  const height = opts.height ?? DEFAULTS.height
  const padding = opts.padding ?? DEFAULTS.padding

  const sorted = cleanAndSort(rawPoints)

  if (sorted.length === 0) {
    return {
      points: [], linePath: '', areaPath: '',
      width, height, min: 0, max: 0, first: null, last: null, delta: null,
    }
  }

  const values = sorted.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min

  const innerW = width - padding * 2
  const innerH = height - padding * 2
  const floorY = height - padding // y del piso (valor mínimo).

  const n = sorted.length
  const plotted: PlottedPoint[] = sorted.map((p, i) => {
    // x: distribuye uniforme por índice. 1 punto → a la derecha.
    const x = n === 1 ? padding + innerW : padding + (innerW * i) / (n - 1)
    // y: valor alto → arriba. Sin rango → centro vertical.
    const norm = range === 0 ? 0.5 : (p.value - min) / range
    const y = floorY - norm * innerH
    return { x, y, date: p.date, value: p.value }
  })

  const linePath = plotted
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${num(pt.x)} ${num(pt.y)}`)
    .join(' ')

  let areaPath = ''
  if (plotted.length >= 2) {
    const firstX = plotted[0].x
    const lastX = plotted[plotted.length - 1].x
    areaPath =
      `M ${num(firstX)} ${num(floorY)} ` +
      plotted.map((pt) => `L ${num(pt.x)} ${num(pt.y)}`).join(' ') +
      ` L ${num(lastX)} ${num(floorY)} Z`
  }

  return {
    points: plotted,
    linePath,
    areaPath,
    width,
    height,
    min,
    max,
    first: sorted[0],
    last: sorted[n - 1],
    // Delta = último vs el registro ANTERIOR (cambio reciente, día contra día),
    // no contra el primero de la ventana — así el ↗/↘ coincide con lo que se ve.
    delta: n >= 2 ? sorted[n - 1].value - sorted[n - 2].value : null,
  }
}

// ─── Helpers de agrupación por día ──────────────────────────────────

/** Clave de día (YYYY-MM-DD) desde una fecha/timestamp ISO. null si inválida. */
function dayKey(iso: string): string | null {
  const m = iso.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

/**
 * Agrega puntos por día con una función reductora. Útil cuando hay varias
 * lecturas el mismo día (ej. 3 métricas de energía) y querés un punto por día.
 */
export function aggregateByDay(
  points: SeriesPoint[],
  reducer: 'avg' | 'sum' | 'last' = 'avg',
): SeriesPoint[] {
  const groups = new Map<string, number[]>()
  for (const p of points) {
    const k = dayKey(p.date)
    if (!k || !Number.isFinite(p.value)) continue
    const arr = groups.get(k) ?? []
    arr.push(p.value)
    groups.set(k, arr)
  }
  const out: SeriesPoint[] = []
  for (const [date, vals] of groups) {
    let value: number
    if (reducer === 'sum') value = vals.reduce((s, v) => s + v, 0)
    else if (reducer === 'last') value = vals[vals.length - 1]
    else value = vals.reduce((s, v) => s + v, 0) / vals.length
    out.push({ date, value })
  }
  return out
}

export type ChartRange = 'semana' | 'mes'

/** Filtra puntos a la VENTANA elegida: 'semana' = semana calendario lun→dom de
 *  `now`; 'mes' = mes calendario de `now`. Parse local (sin TZ). PURO. */
export function filterPointsByRange(points: SeriesPoint[], range: ChartRange, now: Date = new Date()): SeriesPoint[] {
  const y = now.getFullYear(), mo = now.getMonth(), d = now.getDate()
  const dayMs = (iso: string): number | null => {
    const [a, b, c] = iso.slice(0, 10).split('-').map(Number)
    if (!a || !b || !c) return null
    return new Date(a, b - 1, c).getTime()
  }
  if (range === 'mes') {
    return points.filter((p) => {
      const [py, pm] = p.date.slice(0, 10).split('-').map(Number)
      return py === y && pm === mo + 1
    })
  }
  const dow = (now.getDay() + 6) % 7 // lunes = 0
  const lo = new Date(y, mo, d - dow).getTime()
  const hi = new Date(y, mo, d - dow + 6, 23, 59, 59).getTime()
  return points.filter((p) => {
    const t = dayMs(p.date)
    return t != null && t >= lo && t <= hi
  })
}
