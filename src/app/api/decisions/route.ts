// SIR V2 — /api/decisions (14·M5): persistencia de decisiones + captura de resultado.
//   GET   → lista de decisiones del usuario (más nuevas primero).
//   POST  → guarda/actualiza una decisión evaluada (dedupe por título normalizado).
//   PATCH → setea el resultado (outcome) de una decisión ya guardada.
// Session-auth + RLS. Query directa (mismo patrón que /api/people/money).

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { PastDecision } from '@/lib/decision/similar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SEL = 'id, title, description, verdict, weighted, top_risk, outcome, outcome_at, created_at'
const VERDICTS = ['go', 'caution', 'hold']

function str(v: unknown, m: number): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, m) : null
}

function rowToDecision(r: Record<string, unknown>): PastDecision {
  return {
    id: r.id as string,
    title: (r.title as string) ?? '',
    description: (r.description as string) ?? null,
    verdict: ((r.verdict as string) ?? 'caution') as PastDecision['verdict'],
    topRisk: (r.top_risk as string) ?? null,
    outcome: (r.outcome as string) ?? null,
    createdAt: (r.created_at as string) ?? new Date().toISOString(),
  }
}

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { data } = await supabase
    .from('decisions')
    .select(SEL)
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(100)
  return NextResponse.json({ decisions: ((data ?? []) as Record<string, unknown>[]).map(rowToDecision) })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let b: Record<string, unknown>
  try { b = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const title = str(b.title, 200)
  if (!title) return NextResponse.json({ error: 'title requerido' }, { status: 400 })
  const verdict = VERDICTS.includes(b.verdict as string) ? (b.verdict as string) : 'caution'

  const row = {
    user_id: auth.user.id,
    dedupe_key: title.toLowerCase(),
    title,
    description: str(b.description, 1500),
    verdict,
    weighted: typeof b.weighted === 'number' && Number.isFinite(b.weighted) ? b.weighted : null,
    top_risk: str(b.topRisk, 60),
  }
  const { data, error } = await supabase
    .from('decisions')
    .upsert(row, { onConflict: 'user_id,dedupe_key' })
    .select(SEL)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'No se pudo guardar', detail: error.message }, { status: 500 })
  return NextResponse.json({ decision: data ? rowToDecision(data as Record<string, unknown>) : null })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let b: Record<string, unknown>
  try { b = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const id = str(b.id, 80)
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  const outcome = str(b.outcome, 1000)

  const { data, error } = await supabase
    .from('decisions')
    .update({ outcome, outcome_at: outcome ? new Date().toISOString() : null })
    .eq('user_id', auth.user.id)
    .eq('id', id)
    .select(SEL)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'No se pudo actualizar', detail: error.message }, { status: 500 })
  return NextResponse.json({ decision: data ? rowToDecision(data as Record<string, unknown>) : null })
}
