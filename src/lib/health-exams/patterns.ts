// SIR V2 — Patrones de laboratorio: lo consistente en el tiempo NO va "al baúl"
// (idea de Aaron, 17/07). Convierte una tendencia CONSISTENTE (mismo analito
// moviéndose siempre en la misma dirección a través de varios exámenes) en un
// aviso que vale la pena vigilar — sobre todo si va camino a salirse de rango o
// ya se salió. PURO — deriva de buildLabTrends. Testeable.

import type { HealthExam } from './types'
import { buildLabTrends, type LabTrend } from './trend'

export type PatternSeverity = 'alert' | 'watch'

export interface LabPattern {
  name: string
  unit?: string
  range?: string
  direction: 'up' | 'down'
  /** Valores en orden (para el texto: 16.8 → 14.5 → 13.9). */
  values: string[]
  severity: PatternSeverity
  /** Frase lista para mostrar. */
  message: string
}

function cleanNum(v: string): number | null {
  return /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : null
}

/**
 * Detecta patrones dignos de vigilar: analitos con tendencia CONSISTENTE
 * (≥3 mediciones monótonas). 'alert' si el último valor está fuera de rango
 * (la tendencia lo sacó o lo aleja); 'watch' si sigue dentro pero se mueve
 * sostenido. Ordena alerts primero. PURO.
 */
export function labPatterns(exams: HealthExam[]): LabPattern[] {
  const { byCategory } = buildLabTrends(exams)
  const trends: LabTrend[] = byCategory.flatMap((c) => c.trends)
  const out: LabPattern[] = []
  for (const t of trends) {
    if (!t.consistent || (t.direction !== 'up' && t.direction !== 'down')) continue
    const pts = t.points.filter((p): p is NonNullable<typeof p> => !!p)
    const values = pts.map((p) => p.value)
    const nums = values.map(cleanNum).filter((n): n is number => n !== null)
    if (nums.length < 3) continue
    const last = pts[pts.length - 1]
    const outOfRange = last.flag === 'high' || last.flag === 'low'
    const dirWord = t.direction === 'up' ? 'subiendo' : 'bajando'
    const severity: PatternSeverity = outOfRange ? 'alert' : 'watch'
    const rangeTxt = t.range ? ` (rango ${t.range})` : ''
    const tail = outOfRange
      ? `y el último ya está fuera de rango${rangeTxt} — conviene revisarlo`
      : `— dentro de rango${rangeTxt}, pero vigílalo`
    out.push({
      name: t.name, unit: t.unit, range: t.range, direction: t.direction, values, severity,
      message: `${t.name} viene ${dirWord} ${nums.length} exámenes seguidos (${values.join(' → ')}${t.unit ? ' ' + t.unit : ''}) ${tail}.`,
    })
  }
  // alerts primero, luego watch
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'alert' ? -1 : 1))
}

/**
 * Línea compacta para el brief/push matutino: el patrón 'alert' más relevante,
 * o null si no hay ninguno. SOLO 'alert' (algo consistente que YA se salió de
 * rango) merece un empujón proactivo — el 'watch' vive en el panel, sin urgencia.
 * Es "que no se quede al baúl" (idea de Aaron) hecho recordatorio. PURO.
 */
export function labAlertPushLine(patterns: LabPattern[]): string | null {
  const alert = patterns.find((p) => p.severity === 'alert')
  if (!alert) return null
  const dir = alert.direction === 'up' ? 'subiendo' : 'bajando'
  return `Chequeo · ${alert.name} viene ${dir} ${alert.values.length} exámenes seguidos y salió de rango — conviene revisarlo`
}
