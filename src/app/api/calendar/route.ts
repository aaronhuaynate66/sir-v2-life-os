// SIR V2 — GET /api/calendar (Outlook .ics)
//
// Devuelve los eventos próximos del feed de calendario configurado en la env
// var OUTLOOK_ICS_URL (server-only; trae token privado, NUNCA se expone al
// cliente). Auth-gated: es la agenda personal del dueño.
//
// Response 200 SIEMPRE (degrada limpio):
//   { configured: false, events: [] }              → falta OUTLOOK_ICS_URL
//   { configured: true, events: [...], fetchedAt } → ok
//   { configured: true, events: [], error }        → configurado pero falló el fetch
//
// Query (opcional): ?days=NN (1-180), ?limit=NN (1-200)

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { fetchCalendarEvents } from '@/lib/calendar/feed'

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
  const limit = clampInt(sp.get('limit'), 50, 1, 200)

  const result = await fetchCalendarEvents({ horizonDays: days, limit })
  return NextResponse.json(result, { status: 200 })
}

function clampInt(raw: string | null, def: number, min: number, max: number): number {
  const n = raw != null ? parseInt(raw, 10) : NaN
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, n))
}
