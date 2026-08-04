// SIR V2 — GET /api/meds/prescriptions → las recetas con su progreso.
//
// ═══ POR QUÉ ═════════════════════════════════════════════════════════════════
//
// Aaron, 3-ago-2026: *"quiero todo eso ordenado con fecha y hora… y el conteo de
// todas esas medicinas en sir para tener un super registro historico… y a raíz de
// qué"*.
//
// `/api/meds` responde tomas sueltas y un catálogo. No sabe qué tratamiento está en
// curso, ni por qué, ni cuánto falta. Este endpoint es lo que hace que el histórico
// responda "¿a raíz de qué?" y "¿cuántas me faltan?".
//
// El progreso se calcula EN EL SERVIDOR (`lib/meds/curso.ts`, puro) y no en el
// cliente como el gráfico de 14 días: contar sobre las 200 últimas filas del navegador
// no sirve para un curso que empezó antes de esas 200.

import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'
import { dedupeRafagas, progresoDeItem, tomasDeHoy, type ItemCurso } from '@/lib/meds/curso'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface PrescRow {
  id: string
  reason: string | null
  diagnosis: string | null
  prescribed_by: string | null
  provider: string | null
  source: string
  started_on: string
  ends_on: string | null
  status: string
  note: string | null
}
interface ItemRow {
  id: string
  prescription_id: string
  med_name: string
  dose: string | null
  every_hours: number | null
  times_per_day: number | null
  duration_days: number | null
  total_units: number | null
  indication: string | null
}

/** 'YYYY-MM-DD' de hoy en Lima (offset fijo −05:00: Perú no tiene horario de verano). */
function hoyLima(): string {
  return new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10)
}

export async function GET() {
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) {
    return NextResponse.json({ error: 'No autenticado', detail: 'Inicia sesión y reinténtalo.' }, { status: 401 })
  }
  const uid = auth.user.id
  try {
    // PostgREST no lanza: el error viene en `.error`. Si esto falla en silencio, el
    // panel diría "no tienes tratamientos" teniéndolos — la trampa recurrente del repo.
    const { data: pres, error: pErr } = await supabase
      .from('med_prescriptions')
      .select('id, reason, diagnosis, prescribed_by, provider, source, started_on, ends_on, status, note')
      .eq('user_id', uid)
      .order('started_on', { ascending: false })
      .limit(50)
    if (pErr) {
      return NextResponse.json({ error: 'No se pudieron leer las recetas', detail: pErr.message.slice(0, 200) }, { status: 500 })
    }
    const recetas = (pres as PrescRow[]) ?? []
    if (recetas.length === 0) return NextResponse.json({ prescriptions: [] })

    const ids = recetas.map((r) => r.id)
    const { data: its, error: iErr } = await supabase
      .from('med_prescription_items')
      .select('id, prescription_id, med_name, dose, every_hours, times_per_day, duration_days, total_units, indication')
      .in('prescription_id', ids)
    if (iErr) {
      return NextResponse.json({ error: 'No se pudieron leer los medicamentos', detail: iErr.message.slice(0, 200) }, { status: 500 })
    }
    const items = (its as ItemRow[]) ?? []

    // Las tomas de esos ítems. Se traen TODAS las del usuario ligadas a un ítem: son
    // pocas y así el conteo no depende de una ventana de fechas.
    const { data: tk } = await supabase
      .from('med_intakes')
      .select('name, taken_at, prescription_item_id')
      .eq('user_id', uid)
      .not('prescription_item_id', 'is', null)
      .limit(2000)
    const tomas = (tk as Array<{ name: string; taken_at: string; prescription_item_id: string | null }>) ?? []

    // Dedupe de ráfagas ANTES de contar: 35 filas reales eran ~15 tomas por doble tap.
    const porItem = new Map<string, string[]>()
    for (const t of tomas) {
      if (!t.prescription_item_id) continue
      const arr = porItem.get(t.prescription_item_id) ?? []
      arr.push(t.taken_at)
      porItem.set(t.prescription_item_id, arr)
    }
    const hoy = hoyLima()
    const contadas = new Map<string, number>()
    const contadasHoy = new Map<string, number>()
    for (const [itemId, times] of porItem) {
      const limpias = dedupeRafagas(times.map((takenAt) => ({ name: itemId, takenAt })))
      contadas.set(itemId, limpias.length)
      // Las de HOY se cuentan sobre las YA dedupeadas: si no, un doble tap de esta
      // noche haría creer que la dosis de hoy está cubierta dos veces.
      contadasHoy.set(itemId, tomasDeHoy(limpias.map((l) => l.takenAt), hoy))
    }
    const out = recetas.map((r) => {
      const mios = items.filter((i) => i.prescription_id === r.id)
      return {
        id: r.id,
        reason: r.reason,
        diagnosis: r.diagnosis,
        prescribedBy: r.prescribed_by,
        provider: r.provider,
        source: r.source,
        startedOn: r.started_on,
        endsOn: r.ends_on,
        status: r.status,
        note: r.note,
        items: mios.map((i) => {
          const it: ItemCurso = {
            id: i.id,
            medName: i.med_name,
            dose: i.dose,
            timesPerDay: i.times_per_day,
            everyHours: i.every_hours,
            durationDays: i.duration_days,
            indication: i.indication,
          }
          return {
            ...progresoDeItem(it, r.started_on, contadas.get(i.id) ?? 0, hoy, contadasHoy.get(i.id) ?? 0),
            indication: i.indication,
            totalUnits: i.total_units,
            everyHours: i.every_hours,
            durationDays: i.duration_days,
          }
        }),
      }
    })
    return NextResponse.json({ prescriptions: out, hoy })
  } catch (e) {
    reportApiError(e, { route: 'meds/prescriptions' })
    return NextResponse.json({ error: 'Error leyendo las recetas' }, { status: 500 })
  }
}
