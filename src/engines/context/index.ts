// SIR V2 — Context Engine
import type { Signal, Goal } from '@/types'
import type { PeaceScore } from '../peace'
import type { BiologicalState } from '../biological'
import type { FinancialScore } from '../financial'

export interface ContextSnapshot {
  timestamp: string
  peaceScore: PeaceScore
  activeSignals: Signal[]
  biologicalState: BiologicalState
  financialScore: FinancialScore
  activeGoals: Goal[]
  keyAlerts: string[]
  dayQuality: number
  operationalMode: 'normal' | 'focused' | 'recovery' | 'strategic'
}

export function buildContextSnapshot(params: {
  peaceScore: PeaceScore
  activeSignals: Signal[]
  biologicalState: BiologicalState
  financialScore: FinancialScore
  activeGoals: Goal[]
}): ContextSnapshot {
  const { peaceScore, activeSignals, biologicalState, financialScore, activeGoals } = params
  const keyAlerts: string[] = []
  if (peaceScore.total < 4) keyAlerts.push('Peace Score critico')
  if (biologicalState.energyLevel < 4) keyAlerts.push('Energia baja')
  if (financialScore.riskLevel === 'critical') keyAlerts.push('Alerta financiera critica')
  if (activeSignals.some(s => s.urgency === 'immediate')) keyAlerts.push('Senal urgente activa')
  const operationalMode: ContextSnapshot['operationalMode'] =
    peaceScore.recoveryMode || biologicalState.energyLevel < 4 ? 'recovery'
    : peaceScore.total > 8 && biologicalState.energyLevel > 7 ? 'strategic'
    : biologicalState.energyLevel > 7 && biologicalState.stressLevel < 5 ? 'focused'
    : 'normal'
  return {
    timestamp: new Date().toISOString(),
    peaceScore, activeSignals, biologicalState, financialScore, activeGoals, keyAlerts,
    dayQuality: Math.round((peaceScore.total * 0.6 + biologicalState.energyLevel * 0.4) * 10) / 10,
    operationalMode,
  }
}
export * from './types'
export * from './builder'
