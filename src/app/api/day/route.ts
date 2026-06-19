// SIR V2 — GET /api/day?date=YYYY-MM-DD → contexto cruzado de ese día (Lima):
// interacciones, capturas, deals, pasos OKR, salud, score relacional, luna.
// Auth + RLS. Devuelve los slices estructurados + un render de texto.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchDayContext } from '@/lib/day/fetch'
import { renderDayContext } from '@/lib/day/dayContext'
import { todayLimaKey } from '@/lib/dates/limaDay'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const date = req.nextUrl.searchParams.get('date') || todayLimaKey()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date inválida (YYYY-MM-DD)' }, { status: 400 })
  }
  const slices = await fetchDayContext(supabase, auth.user.id, date)
  return NextResponse.json({ slices, text: renderDayContext(slices) }, { status: 200 })
}
