// SIR V2 — GET /api/salud/cardio
//
// La TERCERA vía del aviso cardíaco. Aaron pidió (30-jul-2026): "si detectas una
// alerta o anomalía pues avisarla en el momento, si ves una tendencia entonces
// buscar un espacio tipo en la mañana, o en el reporte de salud".
//
//   · en el momento → `cardioNotify`, desde los endpoints de ingesta de salud
//   · en la mañana  → slot `cardioTrend` del brief (cron/morning-push)
//   · el reporte    → ACÁ. No empuja nada: está donde él lo va a buscar.
//
// Devuelve el veredicto, la serie que lo sostiene y el reporte para el médico ya
// armado, así la UI no recalcula nada ni lo pide aparte.
//
// Auth por SESIÓN: es data de salud del propio usuario y se lee con RLS.

import { NextResponse } from 'next/server'

import { reportApiError } from '@/lib/observability/reportApiError'
import { createClient } from '@/lib/supabase/server'
import { assessCardio, construirReporte } from '@/lib/health/cardioWatch'
import { decidirCanal } from '@/lib/health/cardioSurface'
import { cargarSerie, cargarEventos } from '@/lib/health/cardioNotify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: authData, error: authError } = await supabase.auth.getUser()
    if (authError || !authData?.user) {
      return NextResponse.json({ ok: false, error: 'No autenticado' }, { status: 401 })
    }
    const userId = authData.user.id

    const dias = await cargarSerie(supabase, userId)
    if (dias.length === 0) {
      return NextResponse.json({
        ok: true, level: 'ninguno', canal: 'nada', texto: null, reporte: null, dias: [],
        // Honestidad de cobertura (regla dura del repo): "no hay datos" NO es
        // "estás bien". Si la ventana está vacía hay que decirlo así.
        nota: 'Todavía no hay mediciones cardíacas cargadas — esto no dice que estés bien, dice que no hay con qué mirarlo.',
      })
    }
    const eventos = await cargarEventos(supabase, userId)
    const veredicto = assessCardio(dias, { eventos })
    const aviso = decidirCanal(veredicto)

    return NextResponse.json({
      ok: true,
      level: veredicto.level,
      canal: aviso.canal,
      texto: veredicto.text,
      findings: veredicto.findings,
      baseline: veredicto.baseline,
      reporte: construirReporte(veredicto, dias, { eventos }),
      dias: dias.slice(-30),
      eventos,
    })
  } catch (e) {
    reportApiError(e, { route: 'salud/cardio' })
    return NextResponse.json({ ok: false, error: 'Error al evaluar señales cardíacas' }, { status: 500 })
  }
}
