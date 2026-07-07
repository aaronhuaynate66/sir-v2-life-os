// SIR V2 — GET /api/influence/rehearse/history[?person_id=&limit=]
//
// Histórico de la Sala de Ensayo: las simulaciones pasadas, más nuevas primero.
// Opcionalmente filtra por persona. Devuelve el resultado completo para poder
// re-abrir un ensayo. Auth + RLS.

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const personId = req.nextUrl.searchParams.get('person_id')
  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? 20)))

  let query = supabase
    .from('rehearsal_sessions')
    .select('id, person_id, person_name, objective, result, context_used, created_at')
    .eq('user_id', authData.user.id)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (personId) query = query.eq('person_id', personId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'No se pudo leer el histórico' }, { status: 500 })

  return NextResponse.json({ sessions: data ?? [] }, { status: 200 })
}
