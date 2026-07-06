// SIR V2 — GET /api/relational/partner-effects (C2·R1: efecto partner con shrinkage).
//
// Estima, desde los ratings reales de interacción (person_logs), quién te energiza
// y quién te drena, con partial pooling (empirical Bayes) para no sobreajustar con
// pocos datos. PURO salvo la query. Sin LLM, sin API externa.

import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { computePartnerEffects, isNoiseLog, type InteractionLog } from '@/lib/relational/partnerEffect'
import { logEvent } from '@/lib/observability/logEvent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const userId = auth.user.id

  const [{ data: pl }, { data: people }] = await Promise.all([
    supabase.from('person_logs').select('person_id, value, logged_at, note').eq('user_id', userId).eq('kind', 'interaction'),
    supabase.from('people').select('id, name').eq('user_id', userId),
  ])

  const nameOf = new Map<string, string>((people ?? []).map((p) => [p.id as string, p.name as string]))
  const logs: InteractionLog[] = []
  for (const l of pl ?? []) {
    const pid = l.person_id as string | null
    const value = typeof l.value === 'number' ? l.value : NaN
    const at = l.logged_at ? Date.parse(l.logged_at as string) : NaN
    if (!pid || Number.isNaN(value) || Number.isNaN(at)) continue
    if (isNoiseLog(l.note as string | null, value)) continue // excluir auto-tono/import/llamada value=3
    logs.push({ personId: pid, personName: nameOf.get(pid) ?? 'Alguien', value, at })
  }

  const result = computePartnerEffects(logs, Date.now())

  // Solo lo que tiene señal real (no neutral) para el board.
  const energizing = result.perPerson.filter((p) => p.label === 'energiza').slice(0, 6)
  const draining = result.perPerson.filter((p) => p.label === 'drena').slice(0, 6)

  await logEvent(supabase, userId, {
    type: 'partner-effects', ok: true, route: 'relational/partner-effects',
    meta: { grandMean: result.grandMean, betweenVar: result.betweenVar, energizing: energizing.length, draining: draining.length, insufficient: result.insufficient },
  })

  return NextResponse.json({ grandMean: result.grandMean, insufficient: result.insufficient, energizing, draining })
}
