// SIR V2 — POST /api/reminders/fire-due  (camino sin costo, plan Hobby)
//
// Variante session-auth del cron reminders-due: cuando Aaron tiene la app
// abierta, el watcher client-side llama acá cada par de minutos. Devuelve los
// recordatorios vencidos (due_at <= now, sin resolver, sin avisar) y los marca
// notified_at para que NO se re-disparen (ni acá ni en el cron diario de
// respaldo). El cliente los muestra (toast + notificación del browser).
//
// No manda push: la app está abierta → alcanza con mostrarlos en el cliente.
// El push (app cerrada) sigue siendo trabajo del cron diario.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function err(status: number, error: string) {
  return NextResponse.json({ error }, { status })
}

export async function POST() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado')
  const userId = auth.user.id
  const now = new Date().toISOString()

  const { data } = await supabase
    .from('reminders')
    .select('id, text, due_at, related_person_id')
    .eq('user_id', userId)
    .lte('due_at', now)
    .is('done_at', null)
    .is('notified_at', null)
    .order('due_at', { ascending: true })
    .limit(20)

  const rows = (data ?? []) as Array<{ id: string; text: string; due_at: string; related_person_id: string | null }>
  if (rows.length === 0) return NextResponse.json({ reminders: [] })

  // Marcar notified ANTES de devolver → aunque el cliente falle en mostrarlos,
  // no se re-disparan (misma semántica fire-and-mark que el cron).
  await supabase
    .from('reminders')
    .update({ notified_at: now })
    .eq('user_id', userId)
    .in('id', rows.map((r) => r.id))

  // Enriquecer con nombre/slug de la persona para el deep-link.
  const pids = [...new Set(rows.map((r) => r.related_person_id).filter((v): v is string => v != null))]
  const personById = new Map<string, { name: string; slug: string | null }>()
  if (pids.length > 0) {
    const { data: people } = await supabase
      .from('people')
      .select('id, name, slug')
      .eq('user_id', userId)
      .in('id', pids)
    for (const p of ((people ?? []) as Array<{ id: string; name: string; slug: string | null }>)) {
      personById.set(p.id, { name: p.name, slug: p.slug })
    }
  }

  return NextResponse.json({
    reminders: rows.map((r) => ({
      id: r.id,
      text: r.text,
      due_at: r.due_at,
      done_at: null,
      notified_at: now,
      person_name: r.related_person_id ? personById.get(r.related_person_id)?.name ?? null : null,
      person_slug: r.related_person_id ? personById.get(r.related_person_id)?.slug ?? null : null,
    })),
  })
}
