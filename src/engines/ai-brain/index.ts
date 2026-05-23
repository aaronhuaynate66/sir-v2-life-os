// SIR V2 — AI Brain Engine
import type { Goal, Signal } from '@/types'
import type { PeaceScore } from '../peace'
import type { BiologicalState } from '../biological'

export type CognitivePersona = 'psychologist'|'anthropologist'|'historian'|'strategist'|'operator'|'coach'|'systems_analyst'|'performance_coach'|'finance_master'|'tactician'|'human_biologist'|'identity_architect'

export interface ReasoningOutput {
  primaryInsight: string; supportingInsights: string[]; confidence: number
  personasUsed: CognitivePersona[]; reasoning: string; recommendedAction?: string
  timing: 'now'|'today'|'this_week'|'when_ready'
}

export function buildSystemPrompt(ctx: { peaceScore: number; biologicalState: string; activeGoalCount: number; recoveryMode: boolean; topSignal?: string }): string {
  return `Eres SIR V2, sistema operativo cognitivo-relacional privado del usuario.\nObjetivo: ayudar a conseguir paz.\nPeace Score: ${ctx.peaceScore}/10 | Estado: ${ctx.biologicalState} | Objetivos: ${ctx.activeGoalCount}\n${ctx.recoveryMode ? 'RECOVERY MODE: prioriza recuperacion.' : 'Modo normal.'}\n${ctx.topSignal ? 'Senal: ' + ctx.topSignal : ''}\nPrincipios: directo, contexto especifico, una recomendacion, paz primero.`
}

export function generateReasoningFrame(ctx: { peaceScore: PeaceScore; biologicalState: BiologicalState; activeGoals: Goal[]; activeSignals: Signal[] }, personas: CognitivePersona[] = ['strategist', 'coach']): ReasoningOutput {
  const recovery = ctx.peaceScore.recoveryMode
  const primary = recovery ? 'Sistema detecta baja paz. La prioridad es recuperacion, no accion.' : `Peace Score: ${ctx.peaceScore.total}/10. ${ctx.peaceScore.total > 7 ? 'Buen estado para decisiones.' : 'Factores afectando tu estabilidad.'}`
  return {
    primaryInsight: primary,
    supportingInsights: [`Energia: ${ctx.biologicalState.energyLevel}/10`, `Senales: ${ctx.activeSignals.length}`, `Objetivos: ${ctx.activeGoals.length}`],
    confidence: 0.75, personasUsed: personas, reasoning: primary,
    recommendedAction: recovery ? 'Activar recuperacion' : 'Continuar objetivo prioritario',
    timing: recovery ? 'now' : 'today',
  }
}

export function selectPersonasForContext(peaceScore: number, hasFinancialAlert: boolean, hasRelationalAlert: boolean): CognitivePersona[] {
  const p: CognitivePersona[] = ['strategist', 'coach']
  if (peaceScore < 5) p.push('human_biologist', 'psychologist')
  if (hasFinancialAlert) p.push('finance_master', 'operator')
  if (hasRelationalAlert) p.push('anthropologist')
  return [...new Set(p)].slice(0, 4) as CognitivePersona[]
}
