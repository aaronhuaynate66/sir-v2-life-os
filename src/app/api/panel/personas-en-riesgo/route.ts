// SIR V2 — GET /api/panel/personas-en-riesgo
//
// Mission Control necesita saber POR DÓNDE EMPEZAR el día. Devuelve las
// personas con estado "en_tension" u "overdue" — las que valen la pena
// atender AHORA. Query pragmática:
//
// 1. Moments abiertos con follow_up_on ≤ hoy (overdue) o ≤ hoy+3 (dueSoon).
//    → agrupa por person_id, cuenta overdue + upcoming.
// 2. Personas con logs interaction en los últimos 30d con promedio ≤ 2.3
//    → señal de tono bajo.
//
// Sesión-auth. Read-only. Cache Vercel puede cachear si el header lo pide.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface PersonaRiesgo {
  personId: string
  personName: string
  personSlug: string | null
  reason: 'overdue' | 'due_soon' | 'low_tone' | 'multiple'
  overdueCount: number
  dueSoonCount: number
  toneAvg: number | null
  toneSamples: number
  mostUrgentTitle: string | null
  mostUrgentDaysDelta: number | null
}

const DAY_MS = 86_400_000

function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const userId = auth.user.id

  const now = new Date()
  const todayYmd = ymdLocal(now)
  const dueSoonCutoff = ymdLocal(new Date(now.getTime() + 3 * DAY_MS))
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS).toISOString()

  try {
    // Moments abiertos con follow-up hoy o pasado / próximos 3 días.
    const { data: openMomentsRaw } = await supabase
      .from('relationship_moments')
      .select('id, person_id, title, follow_up_on')
      .eq('user_id', userId).eq('status', 'abierto')
      .not('follow_up_on', 'is', null)
      .lte('follow_up_on', dueSoonCutoff)
      .limit(200)
    const openMoments = (openMomentsRaw ?? []) as Array<{ id: string; person_id: string; title: string; follow_up_on: string }>

    // Logs interaction últimos 30d.
    const { data: logsRaw } = await supabase
      .from('person_logs')
      .select('person_id, value, logged_at')
      .eq('user_id', userId).eq('kind', 'interaction')
      .gte('logged_at', thirtyDaysAgo)
      .limit(500)
    const logs = (logsRaw ?? []) as Array<{ person_id: string; value: number; logged_at: string }>

    // Set de personas afectadas.
    const affectedIds = new Set<string>()
    for (const m of openMoments) affectedIds.add(m.person_id)
    const toneByPerson = new Map<string, { sum: number; count: number }>()
    for (const l of logs) {
      const acc = toneByPerson.get(l.person_id) ?? { sum: 0, count: 0 }
      acc.sum += l.value
      acc.count += 1
      toneByPerson.set(l.person_id, acc)
      if (acc.count >= 3 && acc.sum / acc.count <= 2.3) affectedIds.add(l.person_id)
    }
    if (affectedIds.size === 0) return NextResponse.json({ personas: [] })

    // Cargar nombres.
    const { data: peopleRaw } = await supabase
      .from('people').select('id, name, slug').eq('user_id', userId).in('id', [...affectedIds])
    const peopleById = new Map<string, { id: string; name: string; slug: string | null }>()
    for (const p of ((peopleRaw ?? []) as Array<{ id: string; name: string; slug: string | null }>)) peopleById.set(p.id, p)

    // Armar por persona.
    const byPerson = new Map<string, PersonaRiesgo>()
    function ensure(personId: string): PersonaRiesgo | null {
      const p = peopleById.get(personId)
      if (!p) return null
      let row = byPerson.get(personId)
      if (!row) {
        row = {
          personId, personName: p.name, personSlug: p.slug,
          reason: 'low_tone', overdueCount: 0, dueSoonCount: 0,
          toneAvg: null, toneSamples: 0,
          mostUrgentTitle: null, mostUrgentDaysDelta: null,
        }
        byPerson.set(personId, row)
      }
      return row
    }

    // Moments.
    for (const m of openMoments) {
      const row = ensure(m.person_id); if (!row) continue
      const dueYmd = m.follow_up_on.slice(0, 10)
      const [y1, m1, d1] = todayYmd.split('-').map(Number)
      const [y2, m2, d2] = dueYmd.split('-').map(Number)
      const delta = Math.round((new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime()) / DAY_MS)
      if (delta < 0) row.overdueCount++
      else if (delta <= 3) row.dueSoonCount++
      if (row.mostUrgentDaysDelta == null || delta < row.mostUrgentDaysDelta) {
        row.mostUrgentTitle = m.title
        row.mostUrgentDaysDelta = delta
      }
    }
    // Tono.
    for (const [personId, acc] of toneByPerson) {
      if (!affectedIds.has(personId)) continue
      const avg = acc.sum / acc.count
      const row = ensure(personId); if (!row) continue
      row.toneAvg = Math.round(avg * 10) / 10
      row.toneSamples = acc.count
    }
    // Decidir reason.
    for (const row of byPerson.values()) {
      const hasTension = row.toneAvg != null && row.toneAvg <= 2.3
      if (row.overdueCount > 0 && hasTension) row.reason = 'multiple'
      else if (row.overdueCount > 0) row.reason = 'overdue'
      else if (row.dueSoonCount > 0) row.reason = 'due_soon'
      else row.reason = 'low_tone'
    }

    // Ordenar por urgencia y devolver top 10.
    const rank = { overdue: 0, multiple: 0, due_soon: 1, low_tone: 2 } as const
    const personas = [...byPerson.values()].sort((a, b) => {
      if (rank[a.reason] !== rank[b.reason]) return rank[a.reason] - rank[b.reason]
      if (a.overdueCount !== b.overdueCount) return b.overdueCount - a.overdueCount
      return (a.toneAvg ?? 5) - (b.toneAvg ?? 5)
    }).slice(0, 10)

    return NextResponse.json({ personas })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[panel/personas-en-riesgo] error:', e)
    return NextResponse.json({ personas: [] })
  }
}
