// SIR V2 — GET /api/care/upcoming
//
// Anticipación proactiva: los próximos PLANES con personas afectivas, cada uno con
// EN QUÉ FASE/ÁNIMO va a llegar ella + la sugerencia principal de cuidado. Alimenta
// el panel "Se viene" de Mission Control — para que Aaron llegue preparado sin
// entrar a cada ficha. Solo lectura. Tolerante si falta la tabla (→ vacío).
//
// LÍNEA ÉTICA (doc 17): cuidado, no gestión. Tendencia, no diagnóstico.

import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { computeCycleRegularity } from '@/lib/ciclo/regularity'
import { buildEventCareBrief } from '@/lib/ciclo/eventCareBrief'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HORIZON_DAYS = 21

export async function GET() {
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const userId = auth.user.id

  try {
    const now = new Date()
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const toIso = `${new Date(now.getTime() + HORIZON_DAYS * 86_400_000).toISOString().slice(0, 10)}`

    const { data: evRows, error: evErr } = await supabase
      .from('personal_events')
      .select('id, person_id, title, event_date')
      .eq('user_id', userId)
      .not('person_id', 'is', null)
      .gte('event_date', todayIso)
      .lte('event_date', toIso)
      .order('event_date', { ascending: true })
      .limit(40)
    if (evErr || !evRows || evRows.length === 0) return NextResponse.json({ items: [] })

    const personIds = [...new Set(evRows.map((e) => e.person_id as string))]
    const { data: people } = await supabase
      .from('people')
      .select('id, name, slug, relationship, cycle_start_date, cycle_length_days')
      .eq('user_id', userId)
      .in('id', personIds)
    const byId = new Map((people ?? []).map((p) => [p.id as string, p]))

    // person_cycles para la banda de regularidad (confianza de la predicción).
    const { data: cycles } = await supabase
      .from('person_cycles')
      .select('person_id, date, phase')
      .eq('user_id', userId)
      .in('person_id', personIds)
      .limit(500)
    const cyclesByPerson = new Map<string, { date: string; phase: string }[]>()
    for (const c of cycles ?? []) {
      const arr = cyclesByPerson.get(c.person_id as string) ?? []
      arr.push({ date: c.date as string, phase: c.phase as string })
      cyclesByPerson.set(c.person_id as string, arr)
    }

    const items = evRows.flatMap((ev) => {
      const p = byId.get(ev.person_id as string)
      // Solo afectivo con ciclo (mismo criterio que el Cuidado de la ficha).
      if (!p || p.relationship !== 'romantic' || !p.cycle_start_date) return []
      const reg = computeCycleRegularity((cyclesByPerson.get(p.id as string) ?? []).map((c) => ({ date: c.date, phase: c.phase as never })))
      const brief = buildEventCareBrief({
        eventLabel: ev.title as string, eventDateIso: ev.event_date as string,
        lastPeriodStart: (p.cycle_start_date as string).slice(0, 10),
        cycleLengthDays: (p.cycle_length_days as number) ?? 28, bandDays: reg.bandDays, now,
      })
      if (!brief) return []
      return [{
        eventLabel: brief.eventLabel,
        eventDateIso: brief.eventDateIso,
        daysUntilEvent: brief.daysUntilEvent,
        personName: p.name as string,
        personSlug: (p.slug as string) ?? null,
        phaseLabel: brief.phaseLabel,
        isPms: brief.isPms,
        headline: brief.headline,
        topSuggestion: brief.suggestions[0] ?? '',
        confidence: brief.confidence,
      }]
    })

    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ items: [] })
  }
}
