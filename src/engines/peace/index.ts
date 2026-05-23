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

export function calculatePeaceScore(params: { biologicalState: BiologicalInput; financialState: FinancialInput; goals: Goal[]; moodScore: number; relationshipAlertCount: number }): PeaceScore {
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
  const total = bio * 0.25 + fin * 0.20 + goal * 0.20 + emo * 0.20 + rel * 0.15
  return { total: Math.round(total * 10) / 10, components: { biological: bio, financial: fin, goalProgress: goal, emotional: emo, relational: rel }, trend: 'stable', recoveryMode: total < 4, lastUpdated: new Date().toISOString() }
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
