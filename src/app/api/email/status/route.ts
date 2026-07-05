// SIR V2 — /api/email/status (GET: estado de la conexión) + (DELETE: desconectar).

import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data } = await supabase
    .from('email_connections')
    .select('account_email, last_synced_at, enabled')
    .eq('user_id', auth.user.id).eq('provider', 'microsoft').maybeSingle()

  const configured = !!(process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET)
  const row = data as { account_email: string | null; last_synced_at: string | null; enabled: boolean } | null
  return NextResponse.json({
    configured,
    connected: !!row,
    accountEmail: row?.account_email ?? null,
    lastSyncedAt: row?.last_synced_at ?? null,
  })
}

export async function DELETE() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  await supabase.from('email_connections').delete().eq('user_id', auth.user.id).eq('provider', 'microsoft')
  return NextResponse.json({ ok: true })
}
