// SIR V2 — Modelo de fase acoplado S×C, experimental (11·M6). PURO.
//
// El único módulo PREDICTIVO fuerte. Ajusta un dos-procesos SIMPLIFICADO para
// estimar energía a una hora futura combinando el ritmo circadiano (C, un
// sinusoide ajustado a tu curva de energía observada) y la presión homeostática
// por deuda de sueño (S, penalización por horas de deuda). Alto riesgo de
// sobreajuste con n de una persona → arranca como SOMBRA: se calcula y se valida
// con backtest (MAE contra lo observado) y solo se expone si el error es bajo.
//
// Honestidad: es un modelo GRUESO y el backtest es IN-SAMPLE (describe tu curva,
// no predice fuera de muestra). Se rotula experimental siempre.

import type { EnergyCurve } from './energyCurve'

/** Puntos de energía (1-10) restados por hora de deuda de sueño (proceso S). */
const DEBT_PENALTY = 0.3
/** Umbral de MAE para considerar el modelo "validado" (in-sample). */
const MAE_THRESHOLD = 1.2

export interface TwoProcessModel {
  mean: number
  amplitude: number
  /** Hora del pico circadiano (proceso C). */
  peakHour: number
}

/** Ajusta el sinusoide circadiano a la curva de energía observada. null si la
 *  curva no alcanza el umbral. PURO. */
export function fitTwoProcess(curve: EnergyCurve): TwoProcessModel | null {
  if (!curve.sufficient || curve.buckets.length < 4 || curve.peakHour === null) return null
  const avgs = curve.buckets.map((b) => b.avg)
  const mean = avgs.reduce((a, b) => a + b, 0) / avgs.length
  const amplitude = (Math.max(...avgs) - Math.min(...avgs)) / 2
  return { mean, amplitude, peakHour: curve.peakHour }
}

/** Energía estimada (1-10) a una hora, dado el modelo + la deuda de sueño actual. */
export function predictEnergy(model: TwoProcessModel, hour: number, debtHours = 0): number {
  const c = Math.cos((2 * Math.PI * (hour - model.peakHour)) / 24)
  const raw = model.mean + model.amplitude * c - DEBT_PENALTY * Math.max(0, debtHours)
  return Math.round(Math.max(1, Math.min(10, raw)) * 10) / 10
}

export interface Backtest {
  mae: number
  validated: boolean
}

/** Error medio absoluto del modelo contra las horas observadas (in-sample). */
export function backtestTwoProcess(model: TwoProcessModel, curve: EnergyCurve): Backtest {
  if (curve.buckets.length === 0) return { mae: 0, validated: false }
  const errs = curve.buckets.map((b) => Math.abs(predictEnergy(model, b.hour) - b.avg))
  const mae = Math.round((errs.reduce((a, b) => a + b, 0) / errs.length) * 100) / 100
  return { mae, validated: mae <= MAE_THRESHOLD }
}
