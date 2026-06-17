// SIR V2 — GET /api/person-logs/interactions (Etapa 4 · A)
// Tonos de interacción recientes por persona (person_logs kind='interaction',
// valor 1-5), en orden cronológico, agrupados por persona. Alimenta la señal de
// tono del Alignment Engine (client-side). Auth + RLS.
// Response: { tones: Record<personId, number[]>, events: Record<personId, {q,at}[]> }

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data, error } = await supabase
    .from('person_logs')
    .select('person_id, value, logged_at')
    .eq('user_id', auth.user.id)
    .eq('kind', 'interaction')
    .order('logged_at', { ascending: true })
    .limit(1000)
  if (error) return NextResponse.json({ error: 'No se pudo leer interacciones', detail: error.message }, { status: 500 })

  const tones: Record<string, number[]> = {}
  const events: Record<string, { q: number; at: string }[]> = {}
  for (const r of (data ?? []) as unknown as { person_id: string | null; value: number; logged_at: string }[]) {
    if (!r.person_id || typeof r.value !== 'number') continue
    ;(tones[r.person_id] ??= []).push(r.value)
    ;(events[r.person_id] ??= []).push({ q: r.value, at: r.logged_at })
  }
  return NextResponse.json({ tones, events }, { status: 200 })
}
