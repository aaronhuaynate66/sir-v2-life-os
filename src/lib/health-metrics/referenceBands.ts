// SIR V2 — Rangos de referencia de salud (PURO, testeable).
//
// Deriva la "banda de rango saludable" + estado (ok/warn/bad) para una métrica.
// Solo métricas con umbral clínico claro; el resto → null (sin banda). Fuentes:
// ACE (% grasa, hombres), Tanita (grasa visceral), WHO (IMC), rangos vitales
// estándar (SpO₂, frecuencia respiratoria, FC reposo). La VFC NO tiene rango
// universal → se deriva del BASELINE PERSONAL de la propia serie (media ±0.7·sd),
// estilo Garmin HRV Status. Usado por BodyMetricsTrend (/salud).

import type { HealthMetricType } from '@/types'

export type Tone = 'ok' | 'warn' | 'bad'
export interface RefZone { from: number; to: number; tone: Tone }
export interface RefInfo {
  scale: [number, number]
  zones: RefZone[]
  value: number
  status: Tone
  statusLabel: string
  scaleLabels: string[]
  caption: string
}

/** Posición 0–100% de un valor dentro de una escala (clamp). PURO. */
export function pct(v: number, [min, max]: [number, number]): number {
  if (max <= min) return 0
  return Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))
}

/**
 * Evalúa el valor MÁS RECIENTE de un tipo contra su rango de referencia.
 * `values` es la serie (solo se usa para el baseline personal de la VFC).
 * Devuelve null si el tipo no tiene rango de referencia. PURO.
 */
export function evalReference(type: HealthMetricType, value: number, values: number[]): RefInfo | null {
  switch (type) {
    case 'body_fat_percent':
      return {
        scale: [5, 35],
        zones: [{ from: 5, to: 24, tone: 'ok' }, { from: 24, to: 30, tone: 'warn' }, { from: 30, to: 35, tone: 'bad' }],
        value, status: value <= 24 ? 'ok' : value < 28 ? 'warn' : 'bad',
        statusLabel: value <= 24 ? 'en rango' : value < 28 ? 'sobre tu zona' : 'alto',
        scaleLabels: ['14% fit', '18% ok', '25%+ alto'],
        caption: 'Zona fitness 14–17%, aceptable hasta 24% (hombres).',
      }
    case 'visceral_fat_level':
      return {
        scale: [1, 30],
        zones: [{ from: 1, to: 12, tone: 'ok' }, { from: 12, to: 20, tone: 'warn' }, { from: 20, to: 30, tone: 'bad' }],
        value, status: value <= 12 ? 'ok' : value <= 20 ? 'warn' : 'bad',
        statusLabel: value <= 12 ? 'sano' : value <= 20 ? 'elevado' : 'riesgo',
        scaleLabels: ['1', 'sano ≤12', '13+ exceso'],
        caption: 'La grasa peligrosa: sano hasta 12; 13+ es exceso.',
      }
    case 'bmi':
      return {
        scale: [15, 40],
        zones: [{ from: 15, to: 18.5, tone: 'warn' }, { from: 18.5, to: 25, tone: 'ok' }, { from: 25, to: 30, tone: 'warn' }, { from: 30, to: 40, tone: 'bad' }],
        value, status: value >= 18.5 && value < 25 ? 'ok' : value < 30 ? 'warn' : 'bad',
        statusLabel: value < 18.5 ? 'bajo' : value < 25 ? 'normal' : value < 30 ? 'sobrepeso' : 'obesidad',
        scaleLabels: ['18.5', '25', '30+'],
        caption: 'Sobrepeso ≥25 — pero el IMC no distingue músculo de grasa.',
      }
    case 'blood_oxygen':
      return {
        scale: [90, 100],
        zones: [{ from: 90, to: 95, tone: 'warn' }, { from: 95, to: 100, tone: 'ok' }],
        value, status: value >= 95 ? 'ok' : value >= 90 ? 'warn' : 'bad',
        statusLabel: value >= 95 ? 'normal' : 'bajo',
        scaleLabels: ['90', '95', '100'],
        caption: 'Oxígeno en sangre normal: 95–100%.',
      }
    case 'respiratory_rate':
      return {
        scale: [8, 25],
        zones: [{ from: 8, to: 12, tone: 'warn' }, { from: 12, to: 20, tone: 'ok' }, { from: 20, to: 25, tone: 'warn' }],
        value, status: value >= 12 && value <= 20 ? 'ok' : 'warn',
        statusLabel: value >= 12 && value <= 20 ? 'normal' : 'fuera',
        scaleLabels: ['12', '16', '20'],
        caption: 'Frecuencia respiratoria en reposo: 12–20 rpm.',
      }
    case 'heart_rate':
      return {
        scale: [40, 110],
        zones: [{ from: 40, to: 100, tone: 'ok' }, { from: 100, to: 110, tone: 'warn' }],
        value, status: value <= 100 ? 'ok' : 'warn',
        statusLabel: value < 60 ? 'fondo de atleta' : value <= 100 ? 'normal' : 'alto',
        scaleLabels: ['40', '60', '100'],
        caption: 'Reposo 60–100; bajo (<60) = buen acondicionamiento.',
      }
    case 'hrv_avg': {
      // VFC: sin rango universal → banda del baseline PERSONAL (media ±0.7·sd).
      if (values.length < 3) return null
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length)
      const lo = Math.max(0, mean - 0.7 * sd)
      const hi = mean + 0.7 * sd
      const scale: [number, number] = [Math.min(...values, lo) * 0.9, Math.max(...values, hi) * 1.08]
      return {
        scale, zones: [{ from: lo, to: hi, tone: 'ok' }],
        value, status: value >= lo ? 'ok' : 'warn',
        statusLabel: value >= lo ? 'dentro de tu rango' : 'bajo tu rango',
        scaleLabels: [`${Math.round(lo)}`, 'tu media', `${Math.round(hi)}`],
        caption: 'La VFC se lee vs. tu propio promedio (no una tabla).',
      }
    }
    default:
      return null
  }
}
