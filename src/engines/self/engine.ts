// ============================================================
// SIR V2 — Self Engine
// ============================================================
import type { SelfProfile, BiologicalProfile, EmotionalBaseline, SelfPattern, SelfInsight } from './types'
import type { SelfMetric } from '@/types'

export function updateSelfProfile(
  current: SelfProfile,
  updates: Partial<SelfProfile>
): SelfProfile {
  return {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  }
}

export function analyzeSelfPatterns(metrics: SelfMetric[]): SelfPattern[] {
  const patterns: SelfPattern[] = []

  if (metrics.length < 3) return patterns

  // Detect energy patterns
  const energyMetrics = metrics.filter(m => m.category === 'energy')
  if (energyMetrics.length >= 3) {
    const avgEnergy = energyMetrics.reduce((sum, m) => sum + m.value, 0) / energyMetrics.length
    if (avgEnergy < 4) {
      patterns.push({
        id: 'low-energy-pattern',
        pattern: 'Energía cronicamente baja detectada',
        frequency: 'daily',
        isPositive: false,
        category: 'biological',
        firstDetected: energyMetrics[0].timestamp,
        lastObserved: energyMetrics[energyMetrics.length - 1].timestamp,
        notes: `Promedio de energía: ${avgEnergy.toFixed(1)}/10`,
      })
    }
  }

  // Detect stress patterns
  const stressMetrics = metrics.filter(m => m.category === 'stress')
  if (stressMetrics.length >= 3) {
    const avgStress = stressMetrics.reduce((sum, m) => sum + m.value, 0) / stressMetrics.length
    if (avgStress > 7) {
      patterns.push({
        id: 'high-stress-pattern',
        pattern: 'Estrés sostenido alto detectado',
        frequency: 'daily',
        isPositive: false,
        category: 'emotional',
        firstDetected: stressMetrics[0].timestamp,
        lastObserved: stressMetrics[stressMetrics.length - 1].timestamp,
        notes: `Promedio de estrés: ${avgStress.toFixed(1)}/10`,
      })
    }
  }

  return patterns
}

export function generateSelfInsights(
  profile: SelfProfile,
  biological: BiologicalProfile,
  emotional: EmotionalBaseline,
  metrics: SelfMetric[]
): SelfInsight[] {
  const insights: SelfInsight[] = []
  const now = new Date().toISOString()

  // Identity-values alignment insight
  if (profile.coreValues.length > 0 && profile.limitingBeliefs.length > 0) {
    insights.push({
      id: 'values-beliefs-gap',
      content: `Tienes ${profile.limitingBeliefs.length} creencias limitantes que pueden estar en tensión con tus valores core: ${profile.coreValues.slice(0, 2).join(', ')}`,
      source: 'self-model',
      confidence: 0.75,
      category: 'psychology',
      timestamp: now,
      validated: false,
    })
  }

  // Biological optimization insight
  if (biological.energyCycleType === 'morning' && biological.sleepBaseline > 7) {
    insights.push({
      id: 'morning-person-insight',
      content: 'Eres una persona de mañana con necesidad de sueño alta. Proteger las mañanas es tu mayor palanca de rendimiento.',
      source: 'self-model',
      confidence: 0.85,
      category: 'biological',
      timestamp: now,
      validated: false,
    })
  }

  return insights
}

export function calculateSelfCoherence(profile: SelfProfile): number {
  // How aligned is the identity with values and actions
  let score = 5

  if (profile.coreValues.length > 0) score += 1
  if (profile.mission && profile.mission.length > 10) score += 1
  if (profile.limitingBeliefs.length > 3) score -= 1
  if (profile.motivators.length > 0) score += 1

  return Math.max(0, Math.min(10, score))
}
