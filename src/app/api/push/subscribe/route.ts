// SIR V2 — POST /api/push/subscribe : guarda la suscripción Web Push del navegador.
// Body: PushSubscription JSON ({ endpoint, keys: { p256dh, auth } }). Idempotente
// por (user, endpoint). DELETE: desuscribe (borra por endpoint).
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Body invalido' }, { status: 400 })
  }
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : ''
  const p256dh = typeof body.keys?.p256dh === 'string' ? body.keys.p256dh : ''
  const authKey = typeof body.keys?.auth === 'string' ? body.keys.auth : ''
  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ error: 'Suscripcion incompleta' }, { status: 400 })
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: auth.user.id,
      endpoint,
      p256dh,
      auth: authKey,
      user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
    },
    { onConflict: 'user_id,endpoint' },
  )
  if (error) return NextResponse.json({ error: 'No se pudo guardar', detail: error.message }, { status: 500 })
  return NextResponse.json({ ok: true }, { status: 200 })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let body: { endpoint?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Body invalido' }, { status: 400 })
  }
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint : ''
  if (endpoint) {
    await supabase.from('push_subscriptions').delete().eq('user_id', auth.user.id).eq('endpoint', endpoint)
  }
  return NextResponse.json({ ok: true }, { status: 200 })
}
