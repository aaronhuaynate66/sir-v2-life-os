// SIR V2 — POST/DELETE/GET /api/push/subscribe

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function err(status: number, error: string) {
  return NextResponse.json({ error }, { status })
}

interface SubKeys { p256dh?: string; auth?: string }
interface SubShape { endpoint?: string; keys?: SubKeys }

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  const { data } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, label, ua, created_at, last_success_at, disabled_at')
    .eq('user_id', auth.user.id).is('disabled_at', null)
    .order('created_at', { ascending: false }).limit(20)
  return NextResponse.json({ subscriptions: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  let body: { subscription?: SubShape; label?: unknown }
  try { body = await req.json() as typeof body } catch { return err(400, 'Body inválido') }
  const s = body.subscription
  if (!s || typeof s.endpoint !== 'string' || !s.keys?.p256dh || !s.keys?.auth) return err(400, 'subscription inválida')
  const label = typeof body.label === 'string' ? body.label.slice(0, 60) : null
  const ua = req.headers.get('user-agent')?.slice(0, 300) ?? null

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: auth.user.id,
    endpoint: s.endpoint,
    p256dh: s.keys.p256dh,
    auth: s.keys.auth,
    ua, label,
    disabled_at: null,
  }, { onConflict: 'endpoint' })
  if (error) return err(500, error.message)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  const endpoint = req.nextUrl.searchParams.get('endpoint')
  if (!endpoint) return err(400, 'endpoint requerido')
  await supabase.from('push_subscriptions').update({ disabled_at: new Date().toISOString() })
    .eq('user_id', auth.user.id).eq('endpoint', endpoint)
  return NextResponse.json({ ok: true })
}
