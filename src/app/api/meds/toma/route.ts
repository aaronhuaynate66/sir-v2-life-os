// SIR V2 — POST /api/meds/toma  { itemId } → registra la toma de HOY de ese ítem.
//
// ═══ POR QUÉ EXISTE ══════════════════════════════════════════════════════════
//
// En la captura de `/salud` a 390 px del 5-ago-2026, el bloque "Tu medicación de hoy"
// dice **"falta hoy" cuatro veces y no hay un solo lugar donde tocar**. Ves
// exactamente qué te toca y la única forma de registrarlo era bajar hasta un campo
// de texto libre y escribir el nombre a mano.
//
// El botón de Telegram ya hacía esto bien desde #1090 —`marcarToma`, vinculando a
// `prescription_item_id`— y la web no tenía puerta. Por eso el conteo medido ese día
// era **35 tomas registradas, 0 vinculadas**: el esfuerzo de registrar no llegaba a
// la adherencia.
//
// Se marca por `itemId`, no por nombre: acá no hay que adivinar nada. El formulario
// libre resuelve por texto porque no tiene más remedio; este botón sabe exactamente
// qué medicamento es.
//
// IDEMPOTENTE por (ítem, día): lo garantiza `marcarToma`. Dos taps no son dos dosis.

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { marcarToma } from '@/lib/meds/tomaPendiente'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: { itemId?: unknown }
  try { body = (await req.json()) as typeof body } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const itemId = typeof body.itemId === 'string' ? body.itemId.trim() : ''
  if (!itemId) return NextResponse.json({ error: 'itemId requerido' }, { status: 400 })

  try {
    const r = await marcarToma(supabase, auth.user.id, itemId)
    // null = el ítem no es de este usuario. No se dice "no existe": se dice que no
    // se pudo, sin filtrar si existe o no.
    if (!r) return NextResponse.json({ error: 'No se pudo registrar esa toma' }, { status: 404 })
    return NextResponse.json({ ok: true, medName: r.medName, yaEstaba: r.yaEstaba })
  } catch (e) {
    return NextResponse.json({ error: 'No se pudo registrar', detail: String(e).slice(0, 120) }, { status: 500 })
  }
}
