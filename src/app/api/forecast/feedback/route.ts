// SIR V2 — POST /api/forecast/feedback (Fase 2: recalibración)
//
// Aaron registra QUÉ PASÓ en una ventana → persiste + deriva hit/partial/miss/
// noise + devuelve el hit-rate. Lever fuerte: si confirma fecha de período/PMS,
// la vuelve ANCLA (person_cycles) → el próximo forecast calibra. Auth + RLS.

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'
import { deriveLabel, recalibrate, type FeedbackCategory, type FeedbackLabel } from '@/lib/forecast-conductual/recalibrate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ISO = /^\d{4}-\d{2}-\d{2}$/
const VALID_CATS: FeedbackCategory[] = ['periodo', 'pms', 'dolor', 'medicacion', 'conflicto', 'distancia', 'sensibilidad', 'evento_externo', 'no_paso_nada']

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return errorJson(401, 'No autenticado')
  const userId = auth.user.id

  let body: { forecastId?: unknown; personId?: unknown; windowCenter?: unknown; eventDate?: unknown; categories?: unknown; intensity?: unknown; note?: unknown }
  try { body = (await req.json()) as typeof body } catch { return errorJson(400, 'JSON inválido') }

  const personId = typeof body.personId === 'string' ? body.personId : ''
  if (!personId) return errorJson(400, 'personId requerido')
  const categories = (Array.isArray(body.categories) ? body.categories : []).filter((c): c is FeedbackCategory => typeof c === 'string' && (VALID_CATS as string[]).includes(c))
  if (categories.length === 0) return errorJson(400, 'Marca al menos una categoría')

  const eventDate = typeof body.eventDate === 'string' && ISO.test(body.eventDate.slice(0, 10)) ? body.eventDate.slice(0, 10) : null
  const windowCenter = typeof body.windowCenter === 'string' && ISO.test(body.windowCenter.slice(0, 10)) ? body.windowCenter.slice(0, 10) : null
  const forecastId = typeof body.forecastId === 'string' ? body.forecastId : null
  const intensity = typeof body.intensity === 'number' ? Math.max(1, Math.min(5, Math.round(body.intensity))) : null
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 500) : null
  const label: FeedbackLabel = deriveLabel(categories)

  try {
    // PostgREST devuelve el fallo en `.error` (no lanza) → hay que chequearlo o
    // respondíamos ok:true con el feedback perdido en silencio (degrada justo el
    // forecast que este endpoint intenta mejorar).
    const { error: insErr } = await supabase.from('forecast_feedback').insert({
      user_id: userId, person_id: personId, forecast_id: forecastId,
      window_center: windowCenter, event_date: eventDate, categories, label, intensity, note,
    })
    if (insErr) return errorJson(500, 'No se pudo guardar el feedback', insErr.message.slice(0, 200))

    // Lever fuerte: fecha de período/PMS confirmada → ANCLA (person_cycles). Es
    // Aaron observando/confirmando (source 'aaron'). Idempotente por id+fecha.
    // Si el ancla falla, NO mentimos con anchored:true (el próximo forecast no
    // calibraría y Aaron creería que sí).
    let anchored = false
    if (eventDate && (categories.includes('periodo') || categories.includes('pms'))) {
      const phase = categories.includes('periodo') ? 'bleeding' : 'pms'
      const { error: anchorErr } = await supabase.from('person_cycles').upsert({
        id: `pc:${personId}:${eventDate}`, user_id: userId, person_id: personId, date: eventDate,
        phase, confidence: 'high', source: 'aaron', note: note ?? 'Confirmado desde feedback del forecast.',
      }, { onConflict: 'id' })
      if (anchorErr) reportApiError(anchorErr, { route: 'forecast/feedback', step: 'anchor', personId })
      else anchored = true
    }

    // Hit-rate actualizado.
    const { data: rows } = await supabase.from('forecast_feedback').select('label').eq('user_id', userId).eq('person_id', personId).limit(200)
    const recal = recalibrate(((rows ?? []) as { label: FeedbackLabel }[]).map((r) => r.label).filter(Boolean))
    return NextResponse.json({ ok: true, label, recalibration: recal, anchored })
  } catch (e) {
    reportApiError(e, { route: 'forecast/feedback' })
    return errorJson(500, 'No se pudo guardar el feedback', (e instanceof Error ? e.message : String(e)).slice(0, 200))
  }
}
