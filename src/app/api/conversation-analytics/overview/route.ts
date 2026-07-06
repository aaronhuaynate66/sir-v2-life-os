// SIR V2 — GET /api/conversation-analytics/overview (Capa 0: termómetro de relaciones).
//
// Corre la analítica temporal (PURA) sobre TODAS las personas del usuario y rankea
// quiénes se enfrían ↓ y quiénes calientan ↑, con la última vez que hablaron. Una
// sola query de observaciones + agrupado en memoria. Sin LLM, sin API externa.

import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { messagesFromRows, type ObsRow } from '@/lib/conversation-analytics/fromObservations'
import { analyzeConversation } from '@/lib/conversation-analytics/analyze'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Row { personId: string; name: string; direction: string; slopePerWeek: number; lastContactDaysAgo: number | null; total: number }

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const userId = auth.user.id

  const [{ data: obs }, { data: people }] = await Promise.all([
    supabase.from('observations').select('person_id, capture_type, data')
      .eq('user_id', userId).in('capture_type', ['dm_conversation', 'whatsapp_chat']).eq('is_obsolete', false),
    supabase.from('people').select('id, name').eq('user_id', userId),
  ])

  const nameOf = new Map<string, string>((people ?? []).map((p) => [p.id as string, p.name as string]))
  const byPerson = new Map<string, ObsRow[]>()
  for (const o of obs ?? []) {
    const pid = o.person_id as string | null
    if (!pid) continue
    const arr = byPerson.get(pid) ?? []
    arr.push({ capture_type: o.capture_type as string, data: o.data })
    byPerson.set(pid, arr)
  }

  const now = Date.now()
  const rows: Row[] = []
  for (const [pid, obsRows] of byPerson) {
    const a = analyzeConversation(messagesFromRows(obsRows), now)
    if (a.total < 6 || !a.volume) continue
    rows.push({
      personId: pid, name: nameOf.get(pid) ?? 'Alguien',
      direction: a.volume.direction, slopePerWeek: a.volume.slopePerWeek,
      lastContactDaysAgo: a.lastContactDaysAgo, total: a.total,
    })
  }

  const cooling = rows.filter((r) => r.direction === 'enfriándose').sort((a, b) => a.slopePerWeek - b.slopePerWeek).slice(0, 8)
  const heating = rows.filter((r) => r.direction === 'creciendo').sort((a, b) => b.slopePerWeek - a.slopePerWeek).slice(0, 8)

  return NextResponse.json({ cooling, heating, analyzed: rows.length })
}
