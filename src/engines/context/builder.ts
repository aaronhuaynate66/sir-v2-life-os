// SIR V2 — Rich Context Builder (R5.1B)
// Construye RichContextSnapshot sin tocar buildContextSnapshot antiguo

import type { Signal, Goal, Memory, SelfMetric, Person } from '@/types'
import type { BiologicalState } from '../biological'
import type { FinancialScore, FinancialAlert } from '../financial'
import type { PeaceScore, PeaceThreat } from '../peace'
import type { RelationshipAlert, RelationshipContext } from '../relationship'
import type { TimingWindow } from '../timing'
import type {
  RichContextSnapshot,
  ContextBiologicalState,
  ContextEmotionalState,
  ContextFinancialState,
  ContextRelationalState,
  ContextGoalState,
  ContextSignalState,
  ContextMemoryState,
  ContextTimingState,
  ContextPeaceState,
} from './types'

export interface BuildRichContextParams {
  biologicalState: BiologicalState
  selfMetrics: SelfMetric[]
  financialScore: FinancialScore
  financialAlerts: FinancialAlert[]
  relationshipAlerts: RelationshipAlert[]
  people: Person[]
  goals: Goal[]
  signals: Signal[]
  memoryContext: Memory[]
  timingWindow: TimingWindow
  peaceScore: PeaceScore
  peaceThreats: PeaceThreat[]
}

function buildBiological(bio: BiologicalState): ContextBiologicalState {
  const recoveryNeed: ContextBiologicalState['recoveryNeed'] =
    bio.recoveryScore < 4 ? 'high'
    : bio.recoveryScore < 7 ? 'medium'
    : 'low'
  return {
    energyLevel: bio.energyLevel,
    sleepDebt: bio.sleepDebt,
    recoveryNeed,
    notes: bio.recoveryScore < 4 ? ['Recuperacion critica necesaria'] : [],
  }
}

function buildEmotional(metrics: SelfMetric[]): ContextEmotionalState {
  const moodMs = metrics.filter(m => m.category === 'mood').slice(-3)
  const stressMs = metrics.filter(m => m.category === 'stress').slice(-3)
  const moodScore = moodMs.length > 0
    ? Math.round(moodMs.reduce((s, m) => s + m.value, 0) / moodMs.length * 10) / 10
    : 5
  const stressScore = stressMs.length > 0
    ? Math.round(stressMs.reduce((s, m) => s + m.value, 0) / stressMs.length * 10) / 10
    : 5
  const emotionalLoad: ContextEmotionalState['emotionalLoad'] =
    stressScore > 7 ? 'high' : stressScore > 4 ? 'medium' : 'low'
  const notes: string[] = []
  if (stressScore > 7) notes.push('Estres elevado detectado')
  if (moodScore < 4) notes.push('Estado de animo bajo')
  return { moodScore, stressScore, emotionalLoad, notes }
}

function buildFinancial(
  score: FinancialScore,
  alerts: FinancialAlert[]
): ContextFinancialState {
  return {
    stabilityScore: score.stability,
    monthlyBalance: score.monthlyBalance,
    activeAlerts: alerts.map(a => a.message),
    notes: score.stability < 4 ? ['Estabilidad financiera critica'] : [],
  }
}

function buildRelational(
  alerts: RelationshipAlert[],
  people: Person[]
): ContextRelationalState {
  const highPriority = alerts
    .filter(a => a.urgency === 'immediate')
    .map(a => a.personName)
  const draining = people
    .filter(p => p.energyImpact === 'draining')
    .map(p => p.name)
  const energizing = people
    .filter(p => p.energyImpact === 'energizing')
    .map(p => p.name)
  const notes: string[] = []
  if (alerts.some(a => a.urgency === 'immediate')) {
    notes.push('Hay alertas relacionales inmediatas')
  }
  return {
    activeAlerts: alerts.map(a => a.message),
    highPriorityPeople: highPriority,
    drainingRelationships: draining,
    energizingRelationships: energizing,
    notes,
  }
}

function buildGoals(goals: Goal[]): ContextGoalState {
  const active = goals.filter(g => g.status === 'active')
  const critical = active.filter(g => g.priority === 'critical')
  const blocked = active.filter(g => g.progress < 10 && g.priority !== 'low')
  const notes: string[] = []
  if (critical.length > 0) notes.push(`${critical.length} meta(s) critica(s) activa(s)`)
  return {
    activeGoals: active.length,
    criticalGoals: critical.length,
    topGoalIds: active.slice(0, 3).map(g => g.id),
    blockedGoalIds: blocked.slice(0, 3).map(g => g.id),
    notes,
  }
}

function buildSignals(signals: Signal[]): ContextSignalState {
  const active = signals.filter(s => !s.resolved)
  const immediate = active.filter(s => s.urgency === 'immediate')
  const notes: string[] = []
  if (immediate.length > 0) notes.push(`${immediate.length} senal(es) inmediata(s) activa(s)`)
  return {
    activeSignals: active.length,
    immediateSignals: immediate.length,
    topSignalIds: active.slice(0, 3).map(s => s.id),
    notes,
  }
}

function buildMemory(memories: Memory[]): ContextMemoryState {
  const critical = memories.filter(m => m.importance >= 8)
  const entities = Array.from(
    new Set(memories.flatMap(m => m.entities))
  ).slice(0, 5)
  return {
    totalMemories: memories.length,
    topMemoryIds: memories
      .slice()
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 3)
      .map(m => m.id),
    criticalEntities: entities,
    notes: critical.length > 0 ? [`${critical.length} memoria(s) de alta importancia`] : [],
  }
}

function buildTiming(window: TimingWindow): ContextTimingState {
  const avoid: string[] = window.type === 'avoid' ? [window.description ?? 'Ventana no optima'] : []
  return {
    currentWindow: window.type,
    recommendation: window.description ?? 'Sin descripcion',
    avoid,
    notes: window.type === 'avoid' ? ['Evitar decisiones importantes ahora'] : [],
  }
}

function buildPeace(
  score: PeaceScore,
  threats: PeaceThreat[]
): ContextPeaceState {
  const mode: ContextPeaceState['mode'] =
    score.recoveryMode ? 'recovery'
    : score.total > 8 ? 'strategic'
    : score.total > 6 ? 'focused'
    : 'normal'
  return {
    score: score.total,
    mode,
    threats: threats.map(t => t.description),
    notes: score.total < 4 ? ['Peace Score critico'] : [],
  }
}

function buildSummary(
  bio: ContextBiologicalState,
  emotional: ContextEmotionalState,
  peace: ContextPeaceState
): string[] {
  const summary: string[] = []
  if (peace.score >= 8) summary.push('Estado de paz optimo')
  if (bio.recoveryNeed === 'low' && emotional.emotionalLoad === 'low') {
    summary.push('Condiciones ideales para trabajo estrategico')
  }
  if (bio.recoveryNeed === 'high') summary.push('Se requiere recuperacion biologica')
  if (emotional.emotionalLoad === 'high') summary.push('Carga emocional elevada')
  if (summary.length === 0) summary.push('Estado operativo normal')
  return summary
}

function buildRisks(
  goals: ContextGoalState,
  signals: ContextSignalState,
  financial: ContextFinancialState
): string[] {
  const risks: string[] = []
  if (signals.immediateSignals > 0) risks.push('Senales inmediatas sin atender')
  if (goals.criticalGoals > 0 && goals.blockedGoalIds.length > 0) {
    risks.push('Metas criticas bloqueadas')
  }
  if (financial.stabilityScore < 4) risks.push('Riesgo financiero critico')
  return risks
}

function buildOpportunities(
  bio: ContextBiologicalState,
  peace: ContextPeaceState,
  relational: ContextRelationalState
): string[] {
  const opportunities: string[] = []
  if (bio.energyLevel >= 7 && peace.score >= 7) {
    opportunities.push('Alta energia para proyectos estrategicos')
  }
  if (relational.energizingRelationships.length > 0) {
    opportunities.push('Relaciones energizantes disponibles')
  }
  return opportunities
}

function buildRecommendedFocus(
  goals: ContextGoalState,
  signals: ContextSignalState,
  timing: ContextTimingState
): string[] {
  const focus: string[] = []
  if (timing.currentWindow === 'peak') focus.push('Trabajo de alta concentracion')
  if (signals.immediateSignals > 0) focus.push('Atender senales urgentes')
  if (goals.criticalGoals > 0) focus.push('Avanzar metas criticas')
  if (focus.length === 0) focus.push('Mantenimiento y revision del sistema')
  return focus
}

export function buildRichContextSnapshot(
  params: BuildRichContextParams
): RichContextSnapshot {
  const {
    biologicalState,
    selfMetrics,
    financialScore,
    financialAlerts,
    relationshipAlerts,
    people,
    goals,
    signals,
    memoryContext,
    timingWindow,
    peaceScore,
    peaceThreats,
  } = params

  const biological = buildBiological(biologicalState)
  const emotional = buildEmotional(selfMetrics)
  const financial = buildFinancial(financialScore, financialAlerts)
  const relational = buildRelational(relationshipAlerts, people)
  const goalsState = buildGoals(goals)
  const signalsState = buildSignals(signals)
  const memory = buildMemory(memoryContext)
  const timing = buildTiming(timingWindow)
  const peace = buildPeace(peaceScore, peaceThreats)

  const now = new Date()

  return {
    id: `rich_${now.getTime()}`,
    timestamp: now.toISOString(),
    date: now.toISOString().split('T')[0],
    biological,
    emotional,
    financial,
    relational,
    goals: goalsState,
    signals: signalsState,
    memory,
    timing,
    peace,
    summary: buildSummary(biological, emotional, peace),
    risks: buildRisks(goalsState, signalsState, financial),
    opportunities: buildOpportunities(biological, peace, relational),
    recommendedFocus: buildRecommendedFocus(goalsState, signalsState, timing),
  }
}
