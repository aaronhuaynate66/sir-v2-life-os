// SIR V2 — Timing Engine
import type { BiologicalState } from '../biological'

export interface TimingWindow { type: 'peak'|'good'|'neutral'|'avoid'; startTime?: string; endTime?: string; description: string }

export function getCurrentTimingWindow(bio: BiologicalState, hour = new Date().getHours()): TimingWindow {
  if (bio.energyLevel < 4 || bio.stressLevel > 8) return { type: 'avoid', description: 'Estado suboptimo' }
  if (hour >= 6 && hour <= 10) return { type: 'peak', startTime: '06:00', endTime: '10:00', description: 'Ventana de maximo rendimiento cognitivo' }
  if (hour >= 14 && hour <= 16) return { type: 'avoid', description: 'Valle circadiano' }
  if (hour >= 17 && hour <= 20) return { type: 'good', description: 'Buena ventana para trabajo estrategico' }
  return { type: 'neutral', description: 'Ventana neutral' }
}
