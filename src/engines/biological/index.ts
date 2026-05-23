// SIR V2 — Biological Engine
import type { SleepRecord, SelfMetric } from '@/types'

export interface BiologicalState {
  energyLevel: number
  stressLevel: number
  sleepDebt: number
  lastSleepQuality: number
  lastSleepDuration: number
  recoveryScore: number
  timestamp: string
}

export interface SleepAnalysis {
  averageDuration: number
  averageQuality: number
  sleepDebt: number
  consistency: number
  recommendation: string
}

export function analyzeBiologicalState(sleepRecords: SleepRecord[], metrics: SelfMetric[]): BiologicalState {
  const recent = sleepRecords.slice(-7)
  const last = recent[recent.length - 1]
  const avgSleep = recent.length > 0 ? recent.reduce((s, r) => s + r.duration, 0) / recent.length : 7
  const sleepDebt = Math.max(0, (7.5 - avgSleep) * recent.length)
  const energyMs = metrics.filter(m => m.category === 'energy').slice(-3)
  const energy = energyMs.length > 0 ? energyMs.reduce((s, m) => s + m.value, 0) / energyMs.length : 6
  const stressMs = metrics.filter(m => m.category === 'stress').slice(-3)
  const stress = stressMs.length > 0 ? stressMs.reduce((s, m) => s + m.value, 0) / stressMs.length : 5
  const recovery = energy * 0.35 + (10 - stress) * 0.30 + Math.min(avgSleep / 8 * 10, 10) * 0.35
  return {
    energyLevel: Math.round(energy * 10) / 10,
    stressLevel: Math.round(stress * 10) / 10,
    sleepDebt: Math.round(sleepDebt * 10) / 10,
    lastSleepQuality: last?.quality || 6,
    lastSleepDuration: last?.duration || 7,
    recoveryScore: Math.round(recovery * 10) / 10,
    timestamp: new Date().toISOString(),
  }
}

export function analyzeSleepTrend(records: SleepRecord[]): SleepAnalysis {
  if (!records.length) return { averageDuration: 0, averageQuality: 0, sleepDebt: 0, consistency: 0, recommendation: 'Sin datos de sueno' }
  const avgDur = records.reduce((s, r) => s + r.duration, 0) / records.length
  const avgQ = records.reduce((s, r) => s + r.quality, 0) / records.length
  const debt = Math.max(0, (7.5 - avgDur) * records.length)
  const variance = records.reduce((s, r) => s + Math.pow(r.duration - avgDur, 2), 0) / records.length
  return {
    averageDuration: Math.round(avgDur * 10) / 10,
    averageQuality: Math.round(avgQ * 10) / 10,
    sleepDebt: Math.round(debt * 10) / 10,
    consistency: Math.round(Math.max(0, 10 - Math.sqrt(variance) * 2) * 10) / 10,
    recommendation: avgDur < 6 ? 'Sueno critico. Prioridad maxima.' : avgDur < 7 ? 'Sueno bajo del optimo.' : avgQ < 5 ? 'Calidad de sueno baja.' : 'Sueno en rango optimo',
  }
}
