// SIR V2 — Recommendation Engine
import type { Recommendation, RecommendationPriority, Goal, Signal } from '@/types'
import type { PeaceScore } from '../peace'
import type { BiologicalState } from '../biological'
import type { RelationshipAlert } from '../relationship'

/** Días entre una fecha YYYY-MM-DD y hoy (local). null si no parsea. */
function daysAgoLocal(dateStr: string | null | undefined): number | null {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  const then = new Date(y, m - 1, d).getTime()
  const t = new Date()
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()
  return Math.round((today - then) / 86400000)
}
function sleepNightLabel(days: number | null): string {
  if (days === null) return 'Tu última noche'
  if (days <= 1) return 'Anoche'
  return `Hace ${days} días`
}

export function generateRecommendations(input: { peaceScore: PeaceScore; biologicalState: BiologicalState; activeGoals: Goal[]; activeSignals: Signal[]; relationshipAlerts: RelationshipAlert[] }): Recommendation[] {
  const recs: Recommendation[] = []
  const now = new Date().toISOString()
  const expiry = new Date(Date.now() + 86400000).toISOString()

  if (input.peaceScore.recoveryMode) {
    recs.push({ id: `rec_r_${Date.now()}`, title: 'Protocolo de Recuperacion', description: 'Peace Score bajo umbral critico. Prioridad: recuperacion antes que produccion.', type: 'rest', priority: 'critical', timing: 'now', relatedGoals: [], relatedPersons: [], expectedPeaceImpact: 4, confidence: 0.95, reasoning: `Peace Score: ${input.peaceScore.total}/10`, createdAt: now, expiresAt: expiry, status: 'pending' })
  }

  // Solo si el registro de sueño es RECIENTE (no mostrar una noche vieja como
  // si fuera anoche). Si no hay fecha (fixtures/legacy) no gateamos.
  const sleepDays = daysAgoLocal(input.biologicalState.lastSleepDate)
  const sleepStale = sleepDays !== null && sleepDays > 2
  if (input.biologicalState.lastSleepDuration < 6 && !sleepStale) {
    const night = sleepNightLabel(sleepDays)
    recs.push({ id: `rec_s_${Date.now()}`, title: 'Priorizar Sueno Esta Noche', description: `${night} dormiste ${input.biologicalState.lastSleepDuration}h. Protege esta noche.`, type: 'rest', priority: input.biologicalState.lastSleepDuration < 5 ? 'critical' : 'high', timing: 'today', relatedGoals: [], relatedPersons: [], expectedPeaceImpact: 2, confidence: 0.9, reasoning: 'Sueno bajo umbral optimo de 6h', createdAt: now, expiresAt: expiry, status: 'pending' })
  }

  const relAlert = input.relationshipAlerts.find(a => a.urgency === 'immediate')
  if (relAlert) {
    recs.push({ id: `rec_rl_${Date.now()}`, title: `Atencion: ${relAlert.personName}`, description: relAlert.suggestedAction, type: 'connect', priority: 'high', timing: 'today', relatedGoals: [], relatedPersons: [relAlert.personId], expectedPeaceImpact: 1, confidence: 0.8, reasoning: relAlert.message, createdAt: now, expiresAt: expiry, status: 'pending' })
  }

  const critGoal = input.activeGoals.find(g => g.priority === 'critical' && g.status === 'active')
  if (critGoal && !input.peaceScore.recoveryMode) {
    recs.push({ id: `rec_g_${Date.now()}`, title: `Avanzar: ${critGoal.title}`, description: critGoal.nextAction, type: 'action', priority: 'high', timing: input.biologicalState.energyLevel > 6 ? 'today' : 'this_week', relatedGoals: [critGoal.id], relatedPersons: [], expectedPeaceImpact: 1, confidence: 0.75, reasoning: `Objetivo critico: ${critGoal.progress}% progreso`, createdAt: now, expiresAt: expiry, status: 'pending' })
  }

  return rankRecommendations(recs)
}

export function rankRecommendations(recs: Recommendation[]): Recommendation[] {
  const order: Record<RecommendationPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  return [...recs].sort((a, b) => {
    const diff = order[a.priority] - order[b.priority]
    return diff !== 0 ? diff : b.expectedPeaceImpact - a.expectedPeaceImpact
  })
}
