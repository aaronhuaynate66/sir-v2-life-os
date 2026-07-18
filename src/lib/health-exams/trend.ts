// SIR V2 — Tendencia longitudinal de laboratorio: pivota los valores de varios
// chequeos (health_exams.values) por ANALITO a través del tiempo, para ver la
// evolución de cada valor (ej. hemoglobina 16.8 → 14.5 → 13.9) con su rango.
// PURO — deriva de los exámenes ya guardados, sin tabla nueva. Testeable.

import type { HealthExam, ExamValue, ExamValueFlag } from './types'

export interface TrendPoint {
  date: string
  value: string
  flag: ExamValueFlag
}

export interface LabTrend {
  name: string
  unit?: string
  range?: string
  category: string
  /** Un punto por fecha de examen (en orden cronológico); null si el analito no
   *  se midió en esa fecha. */
  points: (TrendPoint | null)[]
  /** Dirección del último valor numérico vs el primero. null si <2 puntos numéricos. */
  direction: 'up' | 'down' | 'flat' | null
  /** Cuántas fechas tienen valor (para ordenar: los más seguidos, arriba). */
  measuredCount: number
  /** PATRÓN: ≥3 mediciones numéricas y estrictamente monótonas (sube o baja
   *  siempre). La semilla de "algo consistente en el tiempo → patrón" (idea de
   *  Aaron): esto es lo que vale la pena vigilar, no un valor suelto. */
  consistent: boolean
}

export interface LabTrends {
  /** Fechas de examen, cronológicas (YYYY-MM-DD). */
  dates: string[]
  /** Analitos agrupados por categoría, en el orden en que aparecen. */
  byCategory: { category: string; trends: LabTrend[] }[]
}

/** ¿El texto es un número "limpio" comparable? ("13.9" sí, "108/68" o "A Rh+" no). */
function cleanNum(v: string): number | null {
  return /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : null
}

/** Construye la tendencia por analito a partir de los exámenes. PURO. */
export function buildLabTrends(exams: HealthExam[]): LabTrends {
  // Orden cronológico por fecha.
  const sorted = [...exams].sort((a, b) => a.examDate.localeCompare(b.examDate))
  const dates = sorted.map((e) => e.examDate)

  // Índice: nombre-de-analito → { meta, valor por fecha }. Preserva el orden de
  // primera aparición + su categoría.
  const order: string[] = []
  const map = new Map<string, { meta: ExamValue; byDate: Map<string, ExamValue> }>()
  for (const ex of sorted) {
    for (const v of ex.values) {
      const key = v.name.trim().toLowerCase()
      if (!key) continue
      let entry = map.get(key)
      if (!entry) { entry = { meta: v, byDate: new Map() }; map.set(key, entry); order.push(key) }
      // Rellena unit/range/category si el primero no los tenía.
      if (!entry.meta.unit && v.unit) entry.meta = { ...entry.meta, unit: v.unit }
      if (!entry.meta.range && v.range) entry.meta = { ...entry.meta, range: v.range }
      entry.byDate.set(ex.examDate, v)
    }
  }

  const byCatMap = new Map<string, LabTrend[]>()
  const catOrder: string[] = []
  for (const key of order) {
    const { meta, byDate } = map.get(key)!
    const category = (meta as ExamValue & { category?: string }).category || 'Otros'
    const points: (TrendPoint | null)[] = dates.map((d) => {
      const v = byDate.get(d)
      return v ? { date: d, value: v.value, flag: v.flag } : null
    })
    const nums = points.filter((p): p is TrendPoint => !!p).map((p) => cleanNum(p.value)).filter((n): n is number => n !== null)
    let direction: LabTrend['direction'] = null
    let consistent = false
    if (nums.length >= 2) {
      const first = nums[0], last = nums[nums.length - 1]
      direction = last > first ? 'up' : last < first ? 'down' : 'flat'
    }
    if (nums.length >= 3) {
      let allUp = true, allDown = true
      for (let i = 1; i < nums.length; i++) {
        if (nums[i] <= nums[i - 1]) allUp = false
        if (nums[i] >= nums[i - 1]) allDown = false
      }
      consistent = allUp || allDown
    }
    const trend: LabTrend = {
      name: meta.name, unit: meta.unit, range: meta.range, category, points, direction,
      measuredCount: points.filter(Boolean).length, consistent,
    }
    if (!byCatMap.has(category)) { byCatMap.set(category, []); catOrder.push(category) }
    byCatMap.get(category)!.push(trend)
  }

  const byCategory = catOrder.map((category) => ({ category, trends: byCatMap.get(category)! }))
  return { dates, byCategory }
}
