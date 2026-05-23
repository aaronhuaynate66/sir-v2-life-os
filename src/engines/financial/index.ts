// SIR V2 — Financial Engine
import type { FinancialMovement } from '@/types'

export interface FinancialScore { stability: number; liquidityScore: number; savingsRate: number; monthlyBalance: number; riskLevel: 'low'|'medium'|'high'|'critical'; trend: 'improving'|'stable'|'declining' }
export interface FinancialAlert { type: string; severity: 'info'|'warning'|'critical'; message: string; suggestedAction: string }

export function analyzeFinancialStability(movements: FinancialMovement[], liquidityMonths = 0): FinancialScore {
  const income = movements.filter(m => m.type === 'income').reduce((s, m) => s + m.amount, 0)
  const expenses = movements.filter(m => m.type === 'expense').reduce((s, m) => s + m.amount, 0)
  const balance = income - expenses
  const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0
  const liquidityScore = Math.min(10, liquidityMonths * 1.5)
  const balanceScore = balance > 0 ? Math.min(10, 5 + balance / 500) : Math.max(0, 5 + balance / 500)
  const stability = liquidityScore * 0.5 + balanceScore * 0.5
  return { stability: Math.round(stability * 10) / 10, liquidityScore: Math.round(liquidityScore * 10) / 10, savingsRate: Math.round(savingsRate * 10) / 10, monthlyBalance: Math.round(balance * 100) / 100, riskLevel: stability < 3 ? 'critical' : stability < 5 ? 'high' : stability < 7 ? 'medium' : 'low', trend: balance > 0 ? 'improving' : balance === 0 ? 'stable' : 'declining' }
}

export function detectFinancialAlerts(movements: FinancialMovement[], liquidityMonths: number): FinancialAlert[] {
  const alerts: FinancialAlert[] = []
  if (liquidityMonths < 2) alerts.push({ type: 'liquidity', severity: 'critical', message: `Liquidez critica: ${liquidityMonths} mes(es)`, suggestedAction: 'Reducir gastos no esenciales' })
  const income = movements.filter(m => m.type === 'income').reduce((s, m) => s + m.amount, 0)
  const expenses = movements.filter(m => m.type === 'expense').reduce((s, m) => s + m.amount, 0)
  if (expenses > income * 0.9) alerts.push({ type: 'overspend', severity: 'warning', message: 'Gastos >90% del ingreso', suggestedAction: 'Revisar gastos' })
  return alerts
}
