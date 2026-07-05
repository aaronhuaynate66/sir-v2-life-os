// SIR V2 — GET /api/habits/woop (12·M5).
//
// Junta los planes si-entonces (objective_plan) de tus objetivos ACTIVOS con tu
// estado actual (estrés de hoy) y corre el motor puro activeWoopTriggers: devuelve
// los plan_then cuyo "if" se cumple AHORA (franja/hora/estrés). Sin LLM, instantáneo.
// Lecturas RLS-scoped.

import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'
import { activeWoopTriggers, type WoopPlan } from '@/lib/habits/woopTrigger'
import { limaDayKey, todayLimaKey } from '@/lib/dates/limaDay'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

const STRESS_HIGH = 7 // /10

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const userId = authData.user.id
  const nowMs = Date.now()

  try {
    // Objetivos activos (id → título).
    const { data: goalRows } = await supabase
      .from('goals')
      .select('id, title, status')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(100)
    const titleById = new Map<string, string>()
    for (const g of (goalRows ?? []) as Array<{ id: string; title: string }>) titleById.set(g.id, g.title)
    if (titleById.size === 0) return NextResponse.json({ triggers: [] })

    // Planes con si-entonces de esos objetivos.
    const { data: planRows } = await supabase
      .from('objective_plan')
      .select('goal_id, plan_if, plan_then')
      .eq('user_id', userId)
      .not('plan_if', 'is', null)
      .not('plan_then', 'is', null)
    const plans: WoopPlan[] = []
    for (const p of (planRows ?? []) as Array<{ goal_id: string; plan_if: string | null; plan_then: string | null }>) {
      const title = titleById.get(p.goal_id)
      if (!title || !p.plan_if || !p.plan_then) continue
      plans.push({ goalId: p.goal_id, goalTitle: title, planIf: p.plan_if, planThen: p.plan_then })
    }
    if (plans.length === 0) return NextResponse.json({ triggers: [] })

    // Estrés de hoy (si hay).
    let stressElevated = false
    try {
      const today = todayLimaKey(nowMs)
      const sinceIso = new Date(nowMs - 2 * 86_400_000).toISOString()
      const { data: sm } = await supabase
        .from('self_metrics')
        .select('category, value, timestamp')
        .eq('user_id', userId)
        .eq('category', 'stress')
        .gte('timestamp', sinceIso)
        .order('timestamp', { ascending: false })
        .limit(20)
      const todayStress = ((sm ?? []) as Array<{ value: number; timestamp: string }>).find(
        (r) => limaDayKey(r.timestamp) === today,
      )
      if (todayStress && todayStress.value >= STRESS_HIGH) stressElevated = true
    } catch (e) {
      reportApiError(e, { route: 'habits/woop', step: 'stress' })
    }

    const triggers = activeWoopTriggers(plans, nowMs, { stressElevated })
    return NextResponse.json({ triggers })
  } catch (e) {
    reportApiError(e, { route: 'habits/woop' })
    return NextResponse.json({ triggers: [] })
  }
}
