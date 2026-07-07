// SIR V2 — GET /api/relational/trajectory
//
// Motor de predicción C2: pronóstico de trayectoria del vínculo. Junta los
// contactos reales de cada persona (person_logs interaction, EXCLUYENDO los
// marcadores fechados-al-importar) + su last_contact, y proyecta qué vínculos se
// están enfriando y en cuántas semanas quedarían dormidos al ritmo actual.
// Devuelve solo los que se enfrían (los steady/dormidos no son accionables acá).
// Auth + RLS. Pura lectura.

import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { forecastTrajectories, coolingSoon, type TrajectoryInput } from '@/lib/prediction/c2/trajectory'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Notas fechadas al momento del IMPORT (no reflejan la fecha real del contacto) →
// se excluyen del cálculo de cadencia. Los 📞 (con hora real) sí cuentan.
const IMPORT_DATED = /^(Importado|Tono inferido|Conversación reciente)/i

export async function GET() {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const userId = authData.user.id

  const [{ data: logs }, { data: people }] = await Promise.all([
    supabase.from('person_logs').select('person_id, note, logged_at').eq('user_id', userId).eq('kind', 'interaction'),
    supabase.from('people').select('id, name, last_contact').eq('user_id', userId),
  ])

  const byPerson = new Map<string, number[]>()
  for (const l of logs ?? []) {
    if (IMPORT_DATED.test(((l.note as string) ?? '').trim())) continue
    const t = Date.parse(l.logged_at as string)
    if (!Number.isFinite(t)) continue
    const arr = byPerson.get(l.person_id as string) ?? []
    arr.push(t)
    byPerson.set(l.person_id as string, arr)
  }

  const inputs: TrajectoryInput[] = (people ?? []).map((p) => ({
    id: p.id as string,
    name: (p.name as string) ?? 'Sin nombre',
    interactionsMs: byPerson.get(p.id as string) ?? [],
    lastContactMs: p.last_contact ? Date.parse(p.last_contact as string) : null,
  }))

  const all = forecastTrajectories(inputs, Date.now())
  const cooling = coolingSoon(all)
  const summary = {
    steady: all.filter((t) => t.status === 'steady').length,
    cooling: all.filter((t) => t.status === 'cooling').length,
    goingDormant: all.filter((t) => t.status === 'going_dormant').length,
    dormant: all.filter((t) => t.status === 'dormant').length,
  }

  return NextResponse.json({ cooling, summary }, { status: 200 })
}
