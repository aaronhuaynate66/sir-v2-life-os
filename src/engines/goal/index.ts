// SIR V2 — Goal Engine
import type { Goal } from '@/types'

export interface GoalDashboard { activeGoals: Goal[]; criticalGoals: Goal[]; nearDeadline: Goal[]; atRisk: Goal[]; completedRecently: Goal[]; overallProgress: number }

export function detectGoalsAtRisk(goals: Goal[]): Goal[] {
  const now = new Date()
  return goals.filter(g => {
    if (g.status !== 'active') return false
    if (!g.targetDate) return g.progress < 20 && g.priority === 'critical'
    return Math.floor((new Date(g.targetDate).getTime() - now.getTime()) / 86400000) < 30 && g.progress < 50
  })
}

export function buildGoalDashboard(goals: Goal[]): GoalDashboard {
  const now = new Date()
  const active = goals.filter(g => g.status === 'active')
  return {
    activeGoals: active,
    criticalGoals: active.filter(g => g.priority === 'critical'),
    nearDeadline: active.filter(g => g.targetDate && Math.floor((new Date(g.targetDate).getTime() - now.getTime()) / 86400000) <= 14),
    atRisk: detectGoalsAtRisk(goals),
    completedRecently: goals.filter(g => g.status === 'completed' && Math.floor((now.getTime() - new Date(g.updatedAt).getTime()) / 86400000) <= 30),
    overallProgress: active.length > 0 ? Math.round(active.reduce((s, g) => s + g.progress, 0) / active.length) : 0,
  }
}

export function getGoalsByPriority(goals: Goal[]): Goal[] {
  const order = { critical: 0, high: 1, medium: 2, low: 3 }
  return [...goals].filter(g => g.status === 'active').sort((a, b) => order[a.priority] - order[b.priority])
}
