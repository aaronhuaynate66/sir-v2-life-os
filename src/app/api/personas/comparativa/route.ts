// SIR V2 — GET /api/personas/comparativa
//
// Ranking de personas por salud del vínculo. Cruza las MISMAS fuentes que el
// panel Estado (labels), pero para TODAS las personas activas — no una a la vez.
// Devuelve top N por "score compuesto" (tono + urgencia + freshness).
//
// Score: 100 base
//   - tono promedio × 10 (max 50 puntos)
//   - -20 por moment overdue
//   - -10 por moment abierto no overdue
//   - -15 si daysSinceLast > 30
//   - -5 si daysSinceLast > 60

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Persona {
  personId: string
  personName: string
  personSlug: string | null
  toneAvg: number | null
  toneSamples: number
  openMoments: number
  overdueMoments: number
  daysSinceLast: number | null
  score: number
}

const DAY_MS = 86_400_000

function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const userId = auth.user.id
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? 30)
  const now = new Date()
  const todayYmd = ymdLocal(now)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS).toISOString()

  // Traer personas activas (importance_score >= 3).
  const { data: peopleRaw } = await supabase
    .from('people').select('id, name, slug, importance_score').eq('user_id', userId).gte('importance_score', 3)
  const people = ((peopleRaw ?? []) as Array<{ id: string; name: string; slug: string | null; importance_score: number | null }>)
  if (people.length === 0) return NextResponse.json({ personas: [] })

  // Traer logs y moments en batch.
  const personIds = people.map((p) => p.id)
  const [logsRes, momentsRes] = await Promise.all([
    supabase.from('person_logs').select('person_id, value, logged_at').eq('user_id', userId).eq('kind', 'interaction').in('person_id', personIds).gte('logged_at', thirtyDaysAgo).limit(2000),
    supabase.from('relationship_moments').select('person_id, status, follow_up_on').eq('user_id', userId).in('person_id', personIds).eq('status', 'abierto').limit(2000),
  ])
  const logs = (logsRes.data ?? []) as Array<{ person_id: string; value: number; logged_at: string }>
  const moments = (momentsRes.data ?? []) as Array<{ person_id: string; follow_up_on: string | null }>

  // Agrupar.
  const toneByPerson = new Map<string, { sum: number; count: number; lastAt: string }>()
  for (const l of logs) {
    const acc = toneByPerson.get(l.person_id) ?? { sum: 0, count: 0, lastAt: '' }
    acc.sum += l.value; acc.count++
    if (l.logged_at > acc.lastAt) acc.lastAt = l.logged_at
    toneByPerson.set(l.person_id, acc)
  }
  const momentsByPerson = new Map<string, { open: number; overdue: number }>()
  for (const m of moments) {
    const acc = momentsByPerson.get(m.person_id) ?? { open: 0, overdue: 0 }
    acc.open++
    if (m.follow_up_on && m.follow_up_on <= todayYmd) acc.overdue++
    momentsByPerson.set(m.person_id, acc)
  }

  const personas: Persona[] = people.map((p) => {
    const tone = toneByPerson.get(p.id)
    const mo = momentsByPerson.get(p.id) ?? { open: 0, overdue: 0 }
    const toneAvg = tone && tone.count > 0 ? Math.round((tone.sum / tone.count) * 10) / 10 : null
    const daysSinceLast = tone?.lastAt
      ? Math.floor((now.getTime() - new Date(tone.lastAt).getTime()) / DAY_MS)
      : null

    let score = 100
    if (toneAvg != null) score += Math.round(toneAvg * 10) - 30 // 5/5 → +20; 3/5 → 0; 1/5 → -20
    score -= mo.overdue * 20
    score -= (mo.open - mo.overdue) * 10
    if (daysSinceLast != null && daysSinceLast > 30) score -= 15
    if (daysSinceLast != null && daysSinceLast > 60) score -= 5

    return {
      personId: p.id, personName: p.name, personSlug: p.slug,
      toneAvg, toneSamples: tone?.count ?? 0,
      openMoments: mo.open, overdueMoments: mo.overdue,
      daysSinceLast,
      score,
    }
  })

  personas.sort((a, b) => b.score - a.score)
  return NextResponse.json({ personas: personas.slice(0, limit) })
}
