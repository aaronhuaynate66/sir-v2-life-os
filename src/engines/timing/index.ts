// SIR V2 — Timing Engine
import type { BiologicalState } from '../biological'

export interface TimingRecommendation { action: string; timing: 'now'|'today'|'this_week'|'next_week'|'when_ready'; reason: string; confidence: number }
export interface TimingWindow { type: 'peak'|'good'|'neutral'|'avoid'; startTime?: string; endTime?: string; description: string }

export function evaluateTiming(action: string, bio: BiologicalState, peaceScore: number): TimingRecommendation {
  const conditions: string[] = []
  let timing: TimingRecommendation['timing'] = 'when_ready'
  let confidence = 0.5
  if (bio.energyLevel < 4) { conditions.push('Energia baja'); timing = 'this_week'; confidence = 0.6 }
  if (bio.stressLevel > 7) { conditions.push('Estres alto'); timing = 'when_ready'; confidence = 0.7 }
  if (peaceScore < 4) { conditions.push('Peace Score bajo'); timing = 'when_ready'; confidence = 0.85 }
  if (bio.energyLevel >= 7 && bio.stressLevel <= 5 && peaceScore >= 6) { timing = 'now'; confidence = 0.85; conditions.push('Condiciones optimas') }
  return { action, timing, reason: conditions.join('. ') || 'Condiciones estables', confidence }
}

export function getCurrentTimingWindow(bio: BiologicalState, hour = new Date().getHours()): TimingWindow {
  if (bio.energyLevel < 4 || bio.stressLevel > 8) return { type: 'avoid', description: 'Estado suboptimo' }
  if (hour >= 6 && hour <= 10) return { type: 'peak', startTime: '06:00', endTime: '10:00', description: 'Ventana de maximo rendimiento cognitivo' }
  if (hour >= 14 && hour <= 16) return { type: 'avoid', description: 'Valle circadiano' }
  if (hour >= 17 && hour <= 20) return { type: 'good', description: 'Buena ventana para trabajo estrategico' }
  return { type: 'neutral', description: 'Ventana neutral' }
}
