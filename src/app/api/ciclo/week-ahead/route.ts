// SIR V2 — GET /api/ciclo/week-ahead
//
// Detector PROACTIVO de "semana con carga afectiva": proyecta las ventanas
// sensibles del ciclo (premenstrual + menstrual) de las mujeres del círculo con
// ciclo cargado y/o anclas, detecta cuáles intersecan los próximos días y marca
// la sincronía. Devuelve el resumen estructurado + la línea de cuidado ya armada.
// Solo LECTURA. Tolerante si falta la tabla (→ vacío).
//
// LÍNEA ÉTICA (doc 17): CUIDADO y consideración (timing, presencia, dar espacio),
// NUNCA descalificar ni "gestionar". Tendencia, no veredicto. Estimación marcada.
//
// Query opcional: ?horizonDays=7 (1..30, default 7).

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { buildCycleWeekAhead, buildCycleWeekAheadLine, type WomanCycleInput } from '@/lib/ciclo/weekAhead'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const userId = auth.user.id

  const raw = Number(new URL(req.url).searchParams.get('horizonDays'))
  const horizonDays = Number.isFinite(raw) && raw >= 1 && raw <= 30 ? Math.round(raw) : 7

  try {
    const now = new Date()

    // Mujeres del círculo: gender='female' o con ciclo cargado (cubre fichas sin
    // género seteado pero con cycle_start_date).
    const { data: peopleRows } = await supabase
      .from('people')
      .select('id, name, gender, cycle_start_date, cycle_length_days')
      .eq('user_id', userId)
      .or('gender.eq.female,cycle_start_date.not.is.null')
      .limit(500)
    const people = (peopleRows ?? []) as Array<{
      id: string; name: string; gender: string | null
      cycle_start_date: string | null; cycle_length_days: number | null
    }>
    if (people.length === 0) {
      const empty = buildCycleWeekAhead([], now, horizonDays)
      return NextResponse.json({ ...empty, line: null })
    }

    // Anclas observadas (person_cycles) para las últimas ~8 semanas: lo reciente
    // es lo que importa para "ahora / esta semana". Fail-soft si la tabla no propagó.
    const personIds = people.map((p) => p.id)
    const cyclesByPerson = new Map<string, Array<{ date: string; phase: string }>>()
    try {
      const since = new Date(now.getTime() - 60 * 86_400_000).toISOString().slice(0, 10)
      const { data: cycles } = await supabase
        .from('person_cycles')
        .select('person_id, date, phase')
        .eq('user_id', userId)
        .in('person_id', personIds)
        .gte('date', since)
        .limit(1000)
      for (const c of (cycles ?? []) as Array<{ person_id: string; date: string; phase: string }>) {
        const arr = cyclesByPerson.get(c.person_id) ?? []
        arr.push({ date: c.date, phase: c.phase })
        cyclesByPerson.set(c.person_id, arr)
      }
    } catch { /* fail-soft: sin anclas, se proyecta solo por calendario */ }

    const women: WomanCycleInput[] = people
      .map((p) => ({
        personId: p.id,
        name: p.name,
        cycleStartDate: p.cycle_start_date ? p.cycle_start_date.slice(0, 10) : null,
        cycleLengthDays: p.cycle_length_days ?? null,
        anchors: cyclesByPerson.get(p.id) ?? [],
      }))
      // Solo las que tienen ALGO con que proyectar (fecha de ciclo o anclas).
      .filter((w) => w.cycleStartDate || (w.anchors && w.anchors.length > 0))

    const wa = buildCycleWeekAhead(women, now, horizonDays)
    const line = buildCycleWeekAheadLine(wa)
    return NextResponse.json({ ...wa, line })
  } catch {
    const empty = buildCycleWeekAhead([], new Date(), horizonDays)
    return NextResponse.json({ ...empty, line: null })
  }
}
