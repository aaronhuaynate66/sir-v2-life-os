// SIR V2 — GET /api/external/events?location= (Motor #8 fase 2, GDELT por lugar).
// Eventos recientes (7d) que tocan la zona de un objetivo-viaje. Best-effort.
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildEventsQuery, parseGdeltArticles } from '@/lib/external/events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const location = (req.nextUrl.searchParams.get('location') || '').slice(0, 120)
  const q = buildEventsQuery(location)
  if (!q) return NextResponse.json({ events: [] })
  try {
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&format=json&maxrecords=10&timespan=7d&sort=datedesc`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return NextResponse.json({ events: [] })
    const json = await res.json().catch(() => null)
    return NextResponse.json({ events: parseGdeltArticles(json, 4) })
  } catch {
    return NextResponse.json({ events: [] })
  }
}
