'use client'

// SIR V2 — useRichContext Hook (R5.1C)
// Construye RichContextSnapshot usando stores existentes y engines actuales.
// Solo lee datos, no muta stores.

import { useMemo } from 'react'

// Stores
import { useSelfStore } from '@/stores/useSelfStore'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { useRelationshipStore } from '@/stores/useRelationshipStore'
import { useGoalStore } from '@/stores/useGoalStore'
import { useSignalStore } from '@/stores/useSignalStore'
import { useMemoryStore } from '@/stores/useMemoryStore'

// Engines — biological
import { analyzeBiologicalState } from '@/engines/biological'

// Engines — financial
import {
  analyzeFinancialStability,
  detectFinancialAlerts,
} from '@/engines/financial'

// Engines — relationship
import { detectRelationshipAlerts } from '@/engines/relationship'

// Engines — peace
import {
  calculatePeaceScore,
  detectPeaceThreats,
} from '@/engines/peace'

// Engines — timing
import { getCurrentTimingWindow } from '@/engines/timing'

// Builder
import { buildRichContextSnapshot } from '@/engines/context'
import type { RichContextSnapshot } from '@/engines/context'

export function useRichContext(): RichContextSnapshot {
  // ── Leer stores (sin mutación) ────────────────────────────
  const selfMetrics = useSelfStore(s => s.selfMetrics)
  const sleepRecords = useSelfStore(s => s.sleepRecords)
  const financialMovements = useFinanceStore(s => s.financialMovements)
  const people = useRelationshipStore(s => s.people)
  const relationships = useRelationshipStore(s => s.relationships)
  const goals = useGoalStore(s => s.goals)
  const signals = useSignalStore(s => s.signals)
  const memories = useMemoryStore(s => s.memories)

  return useMemo(() => {
    // ── Biological ────────────────────────────────────────────
    const biologicalState = analyzeBiologicalState(sleepRecords, selfMetrics)

    // ── Financial ─────────────────────────────────────────────
    const financialScore = analyzeFinancialStability(financialMovements)
    // Fallback liquidityMonths = 0 (sin datos de contratos/meses explícitos en store)
    const financialAlerts = detectFinancialAlerts(financialMovements, 0)

    // ── Relational ────────────────────────────────────────────
    const relationshipAlerts = detectRelationshipAlerts(people, relationships)

    // ── Peace ─────────────────────────────────────────────────
    // BiologicalInput y FinancialInput son subconjuntos de sus tipos completos
    const peaceScore = calculatePeaceScore({
      biologicalState: {
        energyLevel: biologicalState.energyLevel,
        stressLevel: biologicalState.stressLevel,
        lastSleepDuration: biologicalState.lastSleepDuration,
        recoveryScore: biologicalState.recoveryScore,
      },
      financialState: {
        stabilityScore: financialScore.stability,
        monthlyBalance: financialScore.monthlyBalance,
        liquidityMonths: 0, // fallback: sin dato explícito de meses de liquidez en store
        activeAlerts: financialAlerts.map(a => a.message),
        timestamp: new Date().toISOString(),
      },
      goals,
      // moodScore: promedio de métricas de mood recientes, fallback 5 si vacío
      moodScore: (() => {
        const moodMs = selfMetrics.filter(m => m.category === 'mood').slice(-3)
        return moodMs.length > 0
          ? moodMs.reduce((s, m) => s + m.value, 0) / moodMs.length
          : 5
      })(),
      relationshipAlertCount: relationshipAlerts.length,
    })

    const peaceThreats = detectPeaceThreats(peaceScore)

    // ── Timing ────────────────────────────────────────────────
    const timingWindow = getCurrentTimingWindow(biologicalState)

    // ── Build snapshot ────────────────────────────────────────
    return buildRichContextSnapshot({
      biologicalState,
      selfMetrics,
      financialScore,
      financialAlerts,
      relationshipAlerts,
      people,
      goals,
      signals,
      memoryContext: memories,
      timingWindow,
      peaceScore,
      peaceThreats,
    })
  }, [
    selfMetrics,
    sleepRecords,
    financialMovements,
    people,
    relationships,
    goals,
    signals,
    memories,
  ])
  }
