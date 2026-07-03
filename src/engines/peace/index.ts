// SIR V2 — Peace Engine
import type { Goal } from '@/types'

export interface PeaceScore {
  total: number
  components: { biological: number; relational: number; financial: number; goalProgress: number; emotional: number }
  trend: 'improving' | 'stable' | 'declining'
  recoveryMode: boolean
  lastUpdated: string
}
export interface RecoveryMode { active: boolean; reason: string; startedAt: string; recommendations: string[] }
export interface PeaceThreat { source: string; severity: 'low'|'medium'|'high'|'critical'; description: string; suggestedAction: string }
export interface BiologicalInput { energyLevel: number; stressLevel: number; lastSleepDuration: number; recoveryScore: number }
export interface FinancialInput { stabilityScore: number; monthlyBalance: number; liquidityMonths: number; activeAlerts: string[]; timestamp: string }

/** Deadband del trend de paz (escala 0-10): cambios menores se leen 'stable'. */
export const PEACE_TREND_THRESHOLD = 0.3

/**
 * Tendencia de la paz desde la serie reciente de totales (oldest→newest, ej. los
 * `peaceScore` del histórico de snapshots + el actual). Compara la media de la
 * mitad reciente vs la mitad anterior (ventana de hasta 6 puntos) con deadband.
 * 'stable' si hay <2 puntos o el cambio cae dentro del umbral. PURA.
 */
export function computePeaceTrend(totals: number[], threshold = PEACE_TREND_THRESHOLD): PeaceScore['trend'] {
  const xs = totals.filter((n) => Number.isFinite(n))
  if (xs.length < 2) return 'stable'
  const win = xs.slice(-6)
  const mid = Math.floor(win.length / 2)
  const older = win.slice(0, mid || 1)
  const newer = win.slice(mid)
  const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length
  const delta = avg(newer) - avg(older)
  if (delta > threshold) return 'improving'
  if (delta < -threshold) return 'declining'
  return 'stable'
}

export function calculatePeaceScore(params: { biologicalState: BiologicalInput; financialState: FinancialInput; goals: Goal[]; moodScore: number; relationshipAlertCount: number; /** Serie reciente de peaceScore (oldest→newest) para el trend real. */ history?: number[] }): PeaceScore {
  const { biologicalState: b, financialState: f, goals, moodScore, relationshipAlertCount } = params
  let bio = 7
  if (b.lastSleepDuration < 6) bio -= 2
  if (b.stressLevel > 7) bio -= 2
  if (b.energyLevel > 7) bio += 1
  bio = Math.max(0, Math.min(10, bio))
  const fin = Math.min(10, f.stabilityScore)
  const active = goals.filter(g => g.status === 'active')
  const goal = active.length > 0 ? Math.round(active.reduce((s, g) => s + g.progress, 0) / active.length / 10) : 5
  const emo = Math.min(10, moodScore)
  const rel = Math.max(0, 10 - relationshipAlertCount * 2)
  const total = Math.round((bio * 0.25 + fin * 0.20 + goal * 0.20 + emo * 0.20 + rel * 0.15) * 10) / 10
  // Trend REAL desde la historia (si hay): compara el actual contra la serie
  // reciente. Sin historia → 'stable' (compatible hacia atrás).
  const trend = params.history && params.history.length >= 1
    ? computePeaceTrend([...params.history, total])
    : 'stable'
  return { total, components: { biological: bio, financial: fin, goalProgress: goal, emotional: emo, relational: rel }, trend, recoveryMode: total < 4, lastUpdated: new Date().toISOString() }
}

export function evaluateRecoveryMode(ps: PeaceScore): RecoveryMode {
  if (!ps.recoveryMode) return { active: false, reason: '', startedAt: '', recommendations: [] }
  const c = ps.components
  const min = Math.min(...Object.values(c))
  const reason = c.biological === min ? 'Agotamiento biologico' : c.financial === min ? 'Tension financiera' : c.emotional === min ? 'Estado emocional bajo' : 'Multiples factores'
  return { active: true, reason, startedAt: new Date().toISOString(), recommendations: ['Prioriza el sueno', 'Reduce la lista al minimo', 'Un paso a la vez'] }
}

export function detectPeaceThreats(ps: PeaceScore): PeaceThreat[] {
  const t: PeaceThreat[] = []
  const c = ps.components
  if (c.biological < 4) t.push({ source: 'biological', severity: 'high', description: 'Nivel biologico critico', suggestedAction: 'Priorizar descanso' })
  if (c.financial < 4) t.push({ source: 'financial', severity: 'high', description: 'Estabilidad financiera en riesgo', suggestedAction: 'Revisar flujo de caja' })
  if (c.relational < 4) t.push({ source: 'relational', severity: 'medium', description: 'Tensiones relacionales', suggestedAction: 'Identificar conflicto principal' })
  return t
}
