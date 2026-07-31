// SIR V2 — GET /api/calendar (multi-calendario .ics)
//
// Devuelve los eventos próximos unificados de TODAS las conexiones habilitadas
// del usuario (tabla calendar_connections), o del fallback OUTLOOK_ICS_URL si no
// hay conexiones. Server-only: las URLs traen token privado, NUNCA se exponen al
// cliente. Auth-gated: es la agenda personal del dueño.
//
// Response 200 SIEMPRE (degrada limpio):
//   { configured: false, events: [] }                       → sin conexiones ni env
//   { configured: true, events: [...], calendars, fetchedAt} → ok (cada evento etiquetado)
//   { configured: true, events: [], error }                  → configurado pero falló el fetch
//
// Query (opcional): ?days=NN (1-180), ?past=NN (0-31), ?limit=NN (1-200)

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { fetchCalendarEvents } from '@/lib/calendar/feed'
import {
  personalEventsToCalendar, mergeCalendarEvents,
  SIR_CALENDAR_ID, SIR_CALENDAR_LABEL, type PersonalEventRow,
} from '@/lib/calendar/personalEvents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const sp = req.nextUrl.searchParams
  const days = clampInt(sp.get('days'), 60, 1, 180)
  const past = clampInt(sp.get('past'), 0, 0, 31)
  const limit = clampInt(sp.get('limit'), 50, 1, 200)
  // ?kind=personal | work → filtra las conexiones por tipo. La línea del ciclo
  // pide 'personal' para no consumir el calendario laboral (Camino B).
  const kindRaw = sp.get('kind')
  const kinds = kindRaw === 'personal' ? ['personal' as const] : kindRaw === 'work' ? ['work' as const] : undefined

  // Pasa el cliente autenticado → el reader lee las conexiones del usuario
  // (multi-calendario) y, si no hay, cae al fallback OUTLOOK_ICS_URL.
  const result = await fetchCalendarEvents({ supabase, horizonDays: days, pastDays: past, limit, kinds })

  // ═══ EVENTOS PROPIOS DE SIR ═══════════════════════════════════════════════
  //
  // Aaron, 31-jul-2026: *"¿por qué sigo sin ver en mi calendario el matrimonio de
  // Laura?"*. Porque esta ruta leía **solo feeds .ics externos**. Todo lo cargado
  // DENTRO de SIR —una boda, una cita médica, un descanso indicado por la clínica—
  // era invisible acá **por diseño**, no por un retraso de sincronización. La única
  // vía era `/api/personal-events/[id]/push-to-google`, manual y evento por evento.
  //
  // Nota: el 30-jul se arregló que el BRIEF nombrara la boda (#1033) y se dio el
  // reclamo por cerrado **sin verificar la superficie que él nombró**. Este es el
  // resto de ese arreglo.
  //
  // No se filtra por `kinds`: los eventos propios son personales por definición, y
  // pedir el calendario de trabajo no debería esconderle su cita médica.
  try {
    const { data: peRows } = await supabase
      .from('personal_events')
      .select('id, title, event_date, end_date, all_day, note, source, person_id')
      .gte('event_date', ymdMinusDays(past))
      .order('event_date', { ascending: true })
      .limit(200)
    const rows = (peRows ?? []) as Array<PersonalEventRow & { person_id: string | null }>
    if (rows.length > 0) {
      // El nombre de la persona hace al evento ("la boda de LAURA"); se resuelve
      // solo para los ids que de verdad aparecen.
      const pids = [...new Set(rows.map((r) => r.person_id).filter(Boolean))] as string[]
      const nombre = new Map<string, string>()
      if (pids.length > 0) {
        const { data: ppl } = await supabase.from('people').select('id, name').in('id', pids)
        for (const p of (ppl ?? []) as Array<{ id: string; name: string }>) nombre.set(p.id, p.name)
      }
      const propios = personalEventsToCalendar(
        rows.map((r) => ({ ...r, personName: r.person_id ? nombre.get(r.person_id) ?? null : null })),
      )
      const merged = mergeCalendarEvents(result.events ?? [], propios, limit)
      const calendars = [...(result.calendars ?? [])]
      if (merged.some((e) => e.calendarId === SIR_CALENDAR_ID)) {
        calendars.push({ id: SIR_CALENDAR_ID, label: SIR_CALENDAR_LABEL })
      }
      // `configured` pasa a true si hay eventos propios: la UI no debe decirle "no
      // tienes calendario configurado" mientras le muestra su boda.
      return NextResponse.json(
        { ...result, configured: result.configured || merged.length > 0, events: merged, calendars },
        { status: 200 },
      )
    }
  } catch {
    /* fail-soft: si `personal_events` falla, el calendario externo sale igual */
  }

  return NextResponse.json(result, { status: 200 })
}

/** 'YYYY-MM-DD' de hace N días en Lima (UTC-5), para el borde de la ventana pasada. */
function ymdMinusDays(days: number): string {
  return new Date(Date.now() - 5 * 3_600_000 - days * 86_400_000).toISOString().slice(0, 10)
}

function clampInt(raw: string | null, def: number, min: number, max: number): number {
  const n = raw != null ? parseInt(raw, 10) : NaN
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, n))
}
