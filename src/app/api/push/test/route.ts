// SIR V2 — POST /api/push/test : manda un push de prueba a las suscripciones
// del usuario (para verificar que la cadena funciona en su dispositivo).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendPushToUser } from '@/lib/push/send'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const res = await sendPushToUser(supabase, auth.user.id, {
    title: 'SIR',
    body: 'Notificaciones activas ✓ — así te van a llegar tus avisos.',
    url: '/',
    tag: 'sir-test',
  })
  if (!res.configured) {
    return NextResponse.json({ error: 'Push no configurado', detail: 'Faltan las claves VAPID en el server.' }, { status: 503 })
  }
  if (res.sent === 0) {
    return NextResponse.json({ error: 'Sin dispositivos', detail: 'No hay suscripciones activas. Activá las notificaciones primero.' }, { status: 409 })
  }
  return NextResponse.json({ sent: res.sent, pruned: res.pruned }, { status: 200 })
}
