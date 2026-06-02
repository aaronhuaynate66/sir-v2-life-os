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

  // Pasa el cliente autenticado → el reader lee las conexiones del usuario
  // (multi-calendario) y, si no hay, cae al fallback OUTLOOK_ICS_URL.
  const result = await fetchCalendarEvents({ supabase, horizonDays: days, limit })
  return NextResponse.json(result, { status: 200 })
}

function clampInt(raw: string | null, def: number, min: number, max: number): number {
  const n = raw != null ? parseInt(raw, 10) : NaN
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, n))
}
