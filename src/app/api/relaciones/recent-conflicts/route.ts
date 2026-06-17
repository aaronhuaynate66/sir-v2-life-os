// SIR V2 — GET /api/relaciones/recent-conflicts (#92)
// Interacciones recientes TENSAS (person_logs kind='interaction', value ≤2) de
// los últimos N días, con su nota (textura del conflicto). Alimenta la fricción
// conflicto↔objetivo en /objetivos. Auth + RLS.
// Response: { conflicts: { personId, value, note, date }[] }

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

const WINDOW_DAYS = 45
const DAY_MS = 86_400_000

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const since = new Date(Date.now() - WINDOW_DAYS * DAY_MS).toISOString()
  const { data, error } = await supabase
    .from('person_logs')
    .select('person_id, value, note, logged_at')
    .eq('user_id', auth.user.id)
    .eq('kind', 'interaction')
    .lte('value', 2)
    .gte('logged_at', since)
    .order('logged_at', { ascending: false })
    .limit(100)
  if (error) {
    return NextResponse.json({ error: 'No se pudo leer conflictos', detail: error.message }, { status: 500 })
  }

  const conflicts = ((data ?? []) as Array<{ person_id: string | null; value: number; note: string | null; logged_at: string }>)
    .filter((r) => r.person_id && typeof r.value === 'number')
    .map((r) => ({
      personId: r.person_id as string,
      value: r.value,
      note: (r.note ?? '').slice(0, 400),
      date: (r.logged_at ?? '').slice(0, 10),
    }))
  return NextResponse.json({ conflicts }, { status: 200 })
}
