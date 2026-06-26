// SIR V2 — GET /api/self/relational-daily (Motor #7, complemento server).
// Serie diaria de la CONDUCTA RELACIONAL para cruzar con la biología (cliente):
//   - tone: promedio diario del tono de interacciones (person_logs kind=interaction, 1-5)
//   - conflictDays: días con un episodio/conflicto (relationship_moments.occurred_on)
// Ventana ~120 días. Best-effort.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { dailyAvg } from '@/lib/patterns/observe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const sinceISO = new Date(Date.now() - 120 * 86_400_000).toISOString()

  let tone: { date: string; value: number }[] = []
  try {
    const { data } = await supabase
      .from('person_logs')
      .select('value, logged_at')
      .eq('user_id', auth.user.id)
      .eq('kind', 'interaction')
      .gte('logged_at', sinceISO)
      .limit(2000)
    const rows = (data ?? []) as Array<{ value: number; logged_at: string }>
    tone = dailyAvg(rows.map((r) => ({ timestamp: r.logged_at, value: Number(r.value) })))
  } catch { /* best-effort */ }

  let conflictDays: string[] = []
  try {
    const { data } = await supabase
      .from('relationship_moments')
      .select('occurred_on')
      .eq('user_id', auth.user.id)
      .gte('occurred_on', sinceISO.slice(0, 10))
      .limit(500)
    const set = new Set<string>()
    for (const r of (data ?? []) as Array<{ occurred_on: string | null }>) {
      if (r.occurred_on) set.add(r.occurred_on.slice(0, 10))
    }
    conflictDays = [...set]
  } catch { /* best-effort */ }

  return NextResponse.json({ tone, conflictDays })
}
