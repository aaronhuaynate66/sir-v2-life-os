// SIR V2 — GET /api/salud/lazos
//
// Los objetivos de SALUD activos con sus pasos pendientes. Auth por SESIÓN, RLS
// por dueño.
//
// ═══ POR QUÉ UN ENDPOINT Y NO LOS STORES ═════════════════════════════════════
//
// El panel de lazos médicos se escribió primero leyendo `useGoalStore` +
// `useObjectiveStepStore`, que es el patrón de casi toda la app. Al verificarlo con
// el navegador NO SE VEÍA: en una sesión sin `localStorage` previo esos stores
// están vacíos y `/salud` entera queda en su skeleton, así que el panel devolvía
// null sin que nada fallara.
//
// Habría funcionado en el navegador de Aaron (donde los stores ya están
// hidratados) y eso es exactamente la clase de "funciona en mi máquina" que este
// repo ya pagó caro. Un panel que su dueño tiene que haber visitado antes para que
// aparezca no es un panel: es una caché.
//
// Con esto el panel trae su propia data, igual que `TratamientosPanel`, y se puede
// verificar de verdad.

import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface GoalRow { id: string; title: string; target_date: string | null }
interface StepRow { id: string; objective_id: string; title: string; target_date: string | null; due_time: string | null }

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const userId = auth.user.id

  try {
    const { data: goalsRaw, error: gErr } = await supabase
      .from('goals')
      .select('id, title, target_date')
      .eq('user_id', userId)
      .eq('category', 'health')
      .eq('status', 'active')
      .limit(20)
    // PostgREST no lanza: el error viaja en `.error`. Si esto falla, devolver una
    // lista vacía diría "no tienes lazos abiertos", que es una afirmación falsa.
    if (gErr) throw new Error(`goals: ${gErr.message}`)
    const goals = (goalsRaw ?? []) as GoalRow[]
    if (goals.length === 0) return NextResponse.json({ lazos: [] })

    const { data: stepsRaw, error: sErr } = await supabase
      .from('objective_steps')
      .select('id, objective_id, title, target_date, due_time')
      .eq('user_id', userId)
      .in('objective_id', goals.map((g) => g.id))
      .eq('status', 'pendiente')
      .limit(200)
    if (sErr) throw new Error(`objective_steps: ${sErr.message}`)
    const steps = (stepsRaw ?? []) as StepRow[]

    const lazos = goals
      .map((g) => ({
        id: g.id,
        title: g.title,
        targetDate: g.target_date,
        pasos: steps
          .filter((s) => s.objective_id === g.id)
          .map((s) => ({ id: s.id, title: s.title, targetDate: s.target_date, dueTime: s.due_time }))
          // Sin fecha al final: lo que no vence no compite con lo que sí.
          .sort((a, b) => {
            if (!a.targetDate) return 1
            if (!b.targetDate) return -1
            return a.targetDate.localeCompare(b.targetDate)
          }),
      }))
      .filter((l) => l.pasos.length > 0)

    return NextResponse.json({ lazos })
  } catch (e) {
    reportApiError(e, { route: 'salud/lazos' })
    return NextResponse.json({ error: 'No se pudieron leer los lazos médicos' }, { status: 500 })
  }
}
