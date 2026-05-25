// SIR V2 — Rich Context Types (R5.1A)
// Tipos ricos de contexto sin conflicto con ContextSnapshot existente

export interface ContextBiologicalState {
    energyLevel: number
    sleepDebt: number
    recoveryNeed: 'low' | 'medium' | 'high'
    notes: string[]
}

export interface ContextEmotionalState {
    moodScore: number
    stressScore: number
    emotionalLoad: 'low' | 'medium' | 'high'
    notes: string[]
}

export interface ContextFinancialState {
    stabilityScore: number
    monthlyBalance: number
    activeAlerts: string[]
    notes: string[]
}

export interface ContextRelationalState {
    activeAlerts: string[]
    highPriorityPeople: string[]
    drainingRelationships: string[]
    energizingRelationships: string[]
    notes: string[]
}

export interface ContextGoalState {
    activeGoals: number
    criticalGoals: number
    topGoalIds: string[]
    blockedGoalIds: string[]
    notes: string[]
}

export interface ContextSignalState {
    activeSignals: number
    immediateSignals: number
    topSignalIds: string[]
    notes: string[]
}

export interface ContextMemoryState {
    totalMemories: number
    topMemoryIds: string[]
    criticalEntities: string[]
    notes: string[]
}

export interface ContextTimingState {
    currentWindow: string
    recommendation: string
    avoid: string[]
    notes: string[]
}

export interface ContextPeaceState {
    score: number
    mode: 'normal' | 'focused' | 'strategic' | 'recovery'
    threats: string[]
    notes: string[]
}

export interface RichContextSnapshot {
    id: string
    timestamp: string
    date: string
    biological: ContextBiologicalState
    emotional: ContextEmotionalState
    financial: ContextFinancialState
    relational: ContextRelationalState
    goals: ContextGoalState
    signals: ContextSignalState
    memory: ContextMemoryState
    timing: ContextTimingState
    peace: ContextPeaceState
    summary: string[]
    risks: string[]
    opportunities: string[]
    recommendedFocus: string[]
}

export type SnapshotTriggerReason =
    | 'peace_mode_changed'
    | 'new_threat'
    | 'new_risk'
    | 'new_opportunity'
    | 'mode_recovery'
    | 'manual'
    | 'initial'

export interface SnapshotSummary {
    id: string
    timestamp: string
    date: string
    peaceScore: number
    peaceMode: RichContextSnapshot['peace']['mode']
    summary: string[]
    risks: string[]
    opportunities: string[]
    triggerReason: SnapshotTriggerReason
}

export interface ContextSnapshotHistory {
    snapshots: SnapshotSummary[]
    maxSize: number
}
