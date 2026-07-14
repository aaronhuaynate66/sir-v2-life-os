// SIR V2 — POST /api/ciclo/event-brief
//
// "SIR lo lee a fondo": enriquece el briefing de cuidado por evento con una lectura
// PERSONALIZADA, aterrizada en lo que SIR sabe de la persona (memorias visibles) +
// la fase computada. Voz cálida de SIR. NO escribe. Guardrail ético: cuidado, no
// gestión ni táctica; tendencia, no diagnóstico; intimidad como cercanía según SU
// ritmo, jamás como algo a conseguir.
//
// Body: { personId, eventLabel, eventDate }  →  { text }

import { complete, LlmError } from '@/lib/llm'
import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { reportApiError } from '@/lib/observability/reportApiError'
import { getMemoriesForPerson } from '@/lib/memories/fetch'
import { computeCycleRegularity } from '@/lib/ciclo/regularity'
import { buildEventCareBrief } from '@/lib/ciclo/eventCareBrief'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SYSTEM = `Sos SIR, el sistema personal de Aaron, hablándole a ÉL sobre su pareja. Aaron tiene un
PLAN con ella y querés ayudarlo a llegar preparado para CUIDARLA mejor. Escribís cálido, directo
y honesto, en segunda persona a Aaron ("vas a…", "ella puede…").

REGLAS (no negociables):
- Es CUIDADO, no gestión ni táctica. Nunca sugieras manipular, presionar, ni "aprovechar" su estado.
- La fase del ciclo es una TENDENCIA poblacional, NO un diagnóstico ni una certeza. Decilo. No
  afirmes cómo VA a estar; hablá de qué es más probable y cómo acompañar.
- La intimidad se nombra como cercanía/ternura según SU ritmo y ganas, jamás como algo a conseguir.
- Aterrizá en lo que SIR SABE de ella (te paso memorias). Si el contexto es pobre, mantené el
  consejo general y no inventes.
- Concreto y accionable: gestos reales (un detalle, flores, un plan tranquilo, prepararte para lo
  práctico), no abstracciones.

Devolvé 2 párrafos cortos + una lista de 3-5 sugerencias (con guion). Sin encabezados, sin JSON.`

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const userId = auth.user.id

  const rl = await enforceRateLimit(supabase, userId, 'generation')
  if (!rl.ok) return rl.response

  let body: { personId?: unknown; eventLabel?: unknown; eventDate?: unknown }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const personId = typeof body.personId === 'string' ? body.personId : ''
  const eventLabel = typeof body.eventLabel === 'string' ? body.eventLabel.trim().slice(0, 160) : ''
  const eventDate = typeof body.eventDate === 'string' ? body.eventDate.slice(0, 10) : ''
  if (!personId || !eventLabel || !eventDate) return NextResponse.json({ error: 'Faltan datos del plan' }, { status: 400 })

  const { data: person } = await supabase
    .from('people')
    .select('name, relationship, cycle_start_date, cycle_length_days')
    .eq('user_id', userId).eq('id', personId).maybeSingle()
  if (!person || !person.cycle_start_date) return NextResponse.json({ error: 'Esa persona no tiene ciclo cargado' }, { status: 400 })

  const [memories, cycles] = await Promise.all([
    getMemoriesForPerson(supabase, userId, personId, { limit: 12 })
      .then((rows) => rows.map((m) => (m.content ?? '').trim()).filter(Boolean)).catch(() => [] as string[]),
    (async (): Promise<{ date: string; phase: string }[]> => {
      try {
        const { data } = await supabase.from('person_cycles').select('date, phase').eq('user_id', userId).eq('person_id', personId).limit(200)
        return (data ?? []) as { date: string; phase: string }[]
      } catch { return [] }
    })(),
  ])

  const reg = computeCycleRegularity(cycles.map((c) => ({ date: c.date, phase: c.phase as never })))
  const brief = buildEventCareBrief({
    eventLabel, eventDateIso: eventDate,
    lastPeriodStart: (person.cycle_start_date as string).slice(0, 10),
    cycleLengthDays: (person.cycle_length_days as number) ?? 28, bandDays: reg.bandDays,
  })
  if (!brief) return NextResponse.json({ error: 'No pude computar la fase' }, { status: 400 })

  const firstName = (person.name as string).split(' ')[0]
  const lines: string[] = []
  lines.push(`Plan: ${eventLabel} (${eventDate}). Vas con ${firstName}.`)
  lines.push(`Fase estimada de ${firstName} ese día: ${brief.phaseLabel}${brief.isPms ? ' (premenstrual/SPM)' : ''}, día ${brief.cycleDay}/${brief.cycleLength}, su período proyectado ~${brief.daysUntilHerPeriod}d, confianza ${brief.confidence} (±${brief.uncertaintyDays}d).`)
  lines.push(`Tendencia típica de esa fase: ${brief.stateRead}`)
  if (memories.length > 0) {
    lines.push('', `Lo que SIR sabe de ${firstName} (para personalizar):`)
    for (const m of memories.slice(0, 8)) lines.push(`- ${m.slice(0, 220)}`)
  } else {
    lines.push('', `(SIR tiene poco contexto de ${firstName} — mantené el consejo general.)`)
  }
  lines.push('', `Escribile a Aaron una lectura cálida y personalizada de cómo llega ${firstName} a este plan y qué puede hacer para cuidarla y estar más cerca.`)

  // LLM — vía capa llm/ (router + fallback + telemetría). tier balanced:
  // narrativa de cuidado (ver AI_USAGE_AUDIT bucket a). Dato sensible de la pareja.
  try {
    const res = await complete(
      {
        task: 'ciclo_event_brief', tier: 'balanced', sensitivity: 'third_party',
        system: SYSTEM, maxTokens: 900,
        messages: [{ role: 'user', content: lines.join('\n') }],
      },
      { supabase, userId },
    )
    const text = res.text.trim()
    if (!text) return NextResponse.json({ error: 'Respuesta vacía' }, { status: 502 })
    return NextResponse.json({ text, brief: { phaseLabel: brief.phaseLabel, isPms: brief.isPms } })
  } catch (e) {
    reportApiError(e, { route: 'ciclo/event-brief' })
    if (e instanceof LlmError && e.code === 'no_provider') {
      return NextResponse.json({ error: 'No hay proveedor LLM configurado' }, { status: 500 })
    }
    return NextResponse.json({ error: 'Falló la llamada al modelo', detail: (e instanceof Error ? e.message : String(e)).slice(0, 200) }, { status: 502 })
  }
}
