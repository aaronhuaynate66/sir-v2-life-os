// SIR V2 — GET /api/cron/status-diff
//
// Corre 1x al día. Por cada persona activa del usuario:
//   1. Calcula el label del panel Estado con la data ACTUAL.
//   2. Compara con el snapshot más reciente en person_status_snapshots.
//   3. Si el rank subió (empeoró), crea una person_status_alerts.
//   4. Escribe el snapshot del día (idempotente por (user, person, date)).
//
// Auth: CRON_SECRET (mismo patrón que otros crons del proyecto).

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildEstadoInsights, type EstadoLabel } from '@/lib/estado-con-persona/insights'
import { pushToUser } from '@/lib/push/notify'
import { mapMomentRow } from '@/lib/moments/types'
import { mapPersonCycleRow } from '@/lib/person-cycles/types'
import type { PersonLog } from '@/lib/person-logs/types'
import type { Memory } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const LABEL_RANK: Record<EstadoLabel, number> = {
  cerca: 0, estable: 1, distante: 2, en_tension: 3, sin_data: 4,
}

function ymdLima(): string {
  const now = new Date()
  const lima = new Date(now.getTime() - 5 * 60 * 60 * 1000)
  return `${lima.getUTCFullYear()}-${String(lima.getUTCMonth() + 1).padStart(2, '0')}-${String(lima.getUTCDate()).padStart(2, '0')}`
}

interface PersonRow { id: string; user_id: string; name: string; importance_score: number | null }

function buildAlertMessage(personName: string, from: EstadoLabel, to: EstadoLabel, overdueCount: number, toneAvg: number | null): string {
  const first = personName.split(' ')[0]
  const transition = `${first}: ${from} → ${to}`
  if (to === 'en_tension') {
    if (overdueCount > 0) return `${transition}. ${overdueCount} pendiente${overdueCount === 1 ? '' : 's'} vencido${overdueCount === 1 ? '' : 's'}.`
    if (toneAvg != null && toneAvg <= 2.3) return `${transition}. El tono viene bajo (${toneAvg}/5).`
    return `${transition}. Revisa qué está pasando.`
  }
  if (to === 'distante') return `${transition}. Hace tiempo sin contacto significativo.`
  return `${transition}.`
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase envs missing' }, { status: 500 })

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const today = ymdLima()

  // 1. Traer TODOS los usuarios con personas activas (importance_score >= 3).
  // Como es mono-usuario en la práctica, no aplicamos filtro pesado por user.
  const { data: peopleRaw } = await supabase
    .from('people').select('id, user_id, name, importance_score').gte('importance_score', 3)
  const people = (peopleRaw ?? []) as PersonRow[]
  if (people.length === 0) return NextResponse.json({ processed: 0, alerts: 0 })

  // 2. Cargar snapshots más recientes por (user, person) para comparación.
  const snapshotByKey = new Map<string, { label: EstadoLabel; snapshot_date: string }>()
  const { data: snapsRaw } = await supabase
    .from('person_status_snapshots').select('user_id, person_id, label, snapshot_date')
    .order('snapshot_date', { ascending: false }).limit(2000)
  for (const row of ((snapsRaw ?? []) as Array<{ user_id: string; person_id: string; label: string; snapshot_date: string }>)) {
    const key = `${row.user_id}:${row.person_id}`
    if (!snapshotByKey.has(key)) snapshotByKey.set(key, { label: row.label as EstadoLabel, snapshot_date: row.snapshot_date })
  }

  let processed = 0
  let alertsCreated = 0
  const cutoff30 = new Date(Date.now() - 30 * 86_400_000).toISOString()

  for (const person of people) {
    processed++
    // 3. Cargar contexto para calcular label.
    const [logsRes, momentsRes, cyclesRes, memoriesRes] = await Promise.all([
      supabase.from('person_logs').select('id, user_id, person_id, kind, value, note, logged_at, created_at')
        .eq('user_id', person.user_id).eq('person_id', person.id).gte('logged_at', cutoff30).limit(50),
      supabase.from('relationship_moments').select('id, person_id, title, detail, status, occurred_on, follow_up_on, resolution, created_at, updated_at')
        .eq('user_id', person.user_id).eq('person_id', person.id).order('occurred_on', { ascending: false }).limit(15),
      supabase.from('person_cycles').select('id, person_id, date, phase, confidence, source, note, created_at')
        .eq('user_id', person.user_id).eq('person_id', person.id).limit(30),
      supabase.from('memories').select('id, person_id, title, content, type, timestamp, tags, importance, is_private')
        .eq('user_id', person.user_id).eq('person_id', person.id).eq('is_private', false).limit(10),
    ])

    const personLogs = ((logsRes.data ?? []) as Array<{ id: string; user_id: string; person_id: string; kind: string; value: number; note: string | null; logged_at: string; created_at: string }>)
      .map((r) => ({ id: r.id, userId: r.user_id, personId: r.person_id, kind: r.kind as PersonLog['kind'], value: r.value, note: r.note, loggedAt: r.logged_at, createdAt: r.created_at }))
    const moments = ((momentsRes.data ?? []) as Parameters<typeof mapMomentRow>[0][]).map(mapMomentRow)
    const personCycles = ((cyclesRes.data ?? []) as Parameters<typeof mapPersonCycleRow>[0][]).map(mapPersonCycleRow)
    const memories = ((memoriesRes.data ?? []) as unknown as Memory[])

    const insights = buildEstadoInsights({ personLogs, moments, personCycles, memories, now: new Date() })

    // 4. Comparar con snapshot anterior.
    const key = `${person.user_id}:${person.id}`
    const prev = snapshotByKey.get(key)
    if (prev && LABEL_RANK[insights.overallLabel] > LABEL_RANK[prev.label] && insights.overallLabel !== 'sin_data' && prev.label !== 'sin_data') {
      // Empeoramiento. Crear alerta (skip si ya hay una activa por el mismo par).
      const { data: existing } = await supabase
        .from('person_status_alerts').select('id')
        .eq('user_id', person.user_id).eq('person_id', person.id)
        .is('dismissed_at', null).limit(1)
      if ((existing ?? []).length === 0) {
        const message = buildAlertMessage(person.name, prev.label, insights.overallLabel, insights.overdueCount, insights.recentAvg)
        await supabase.from('person_status_alerts').insert({
          user_id: person.user_id, person_id: person.id,
          from_label: prev.label, to_label: insights.overallLabel,
          message,
        })
        alertsCreated++
        // Push notification best-effort (no bloquea el cron).
        void pushToUser(person.user_id, {
          title: `SIR · ${person.name.split(' ')[0]}`,
          body: message,
          url: '/panel',
          tag: `status-${person.id}`,
        })
      }
    }

    // 5. Snapshot del día (idempotente).
    await supabase.from('person_status_snapshots').upsert({
      user_id: person.user_id, person_id: person.id,
      label: insights.overallLabel, snapshot_date: today,
    }, { onConflict: 'user_id,person_id,snapshot_date' })
  }

  return NextResponse.json({ processed, alertsCreated, day: today })
}
