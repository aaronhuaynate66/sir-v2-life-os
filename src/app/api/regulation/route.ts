// SIR V2 — /api/regulation (13·M4): registro de estrategia aplicada + si ayudó.
//   GET   → registros del usuario (más nuevos primero).
//   POST  → registra que aplicaste una estrategia.
//   PATCH → califica si te ayudó (yes|somewhat|no).
// Session-auth + RLS. Query directa.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { RegulationLog } from '@/lib/emotion/learning'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SEL = 'id, strategy, note, helped, applied_at'
const STRATEGIES = ['response_modulation', 'reappraisal', 'other']
const HELPED = ['yes', 'somewhat', 'no']

function str(v: unknown, m: number): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, m) : null
}

function rowToLog(r: Record<string, unknown>): RegulationLog {
  return {
    id: r.id as string,
    strategy: (r.strategy as string) ?? 'other',
    helped: (r.helped as RegulationLog['helped']) ?? null,
    appliedAt: (r.applied_at as string) ?? new Date().toISOString(),
  }
}

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { data } = await supabase
    .from('regulation_logs')
    .select(SEL)
    .eq('user_id', auth.user.id)
    .order('applied_at', { ascending: false })
    .limit(100)
  return NextResponse.json({ logs: ((data ?? []) as Record<string, unknown>[]).map(rowToLog) })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let b: Record<string, unknown>
  try { b = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const strategy = STRATEGIES.includes(b.strategy as string) ? (b.strategy as string) : 'other'
  const { data, error } = await supabase
    .from('regulation_logs')
    .insert({ user_id: auth.user.id, strategy, note: str(b.note, 500) })
    .select(SEL)
    .single()
  if (error) return NextResponse.json({ error: 'No se pudo guardar', detail: error.message }, { status: 500 })
  return NextResponse.json({ log: rowToLog(data as Record<string, unknown>) })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let b: Record<string, unknown>
  try { b = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const id = str(b.id, 80)
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  const helped = HELPED.includes(b.helped as string) ? (b.helped as string) : null
  const { data, error } = await supabase
    .from('regulation_logs')
    .update({ helped })
    .eq('user_id', auth.user.id)
    .eq('id', id)
    .select(SEL)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'No se pudo actualizar', detail: error.message }, { status: 500 })
  return NextResponse.json({ log: data ? rowToLog(data as Record<string, unknown>) : null })
}
