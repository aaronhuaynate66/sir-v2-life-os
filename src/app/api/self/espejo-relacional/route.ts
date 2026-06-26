// SIR V2 — /api/self/espejo-relacional (Motor #1, complemento server).
// Resume la parte RELACIONAL de la semana que el Espejo (client) no puede ver:
//   - interacciones (person_logs kind=interaction) de los últimos 7 días + cuántas tensas (value<=2)
//   - conflictos/temas abiertos (relationship_moments status='abierto') + uno representativo
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DAY = 86_400_000

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const sinceISO = new Date(Date.now() - 7 * DAY).toISOString()
  let interactions = 0
  let tense = 0
  let openConflicts = 0
  let topConflict: string | null = null
  try {
    const { data: logs } = await supabase
      .from('person_logs')
      .select('value')
      .eq('user_id', auth.user.id)
      .eq('kind', 'interaction')
      .gte('logged_at', sinceISO)
      .limit(500)
    const rows = (logs ?? []) as Array<{ value: number }>
    interactions = rows.length
    tense = rows.filter((r) => Number(r.value) <= 2).length
  } catch { /* best-effort */ }
  try {
    const { data: moments } = await supabase
      .from('relationship_moments')
      .select('title, occurred_on')
      .eq('user_id', auth.user.id)
      .eq('status', 'abierto')
      .order('occurred_on', { ascending: false })
      .limit(50)
    const rows = (moments ?? []) as Array<{ title: string }>
    openConflicts = rows.length
    topConflict = rows[0]?.title ?? null
  } catch { /* best-effort */ }
  return NextResponse.json({ interactions, tense, openConflicts, topConflict })
}
