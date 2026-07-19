// SIR V2 — GET/POST/DELETE /api/relaciones/contact-timing
//
// Señal de TIMING relacional (mig 0150). GET devuelve el veredicto ("buen/mal
// momento para contactar a X") + las señales activas. POST registra una señal
// (Aaron marca lo que ve; la futura extensión pasiva usará el mismo endpoint).
// GET fail-open mientras la migración propaga (PostgREST cachea el esquema).

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rowToContactSignal, type ContactSignalKind, type ContactSignalSource } from '@/lib/contact-timing/types'
import { assessContactTiming, isSignalActive } from '@/lib/contact-timing/assess'
import { analyzeContactRhythm, type ChatEvent } from '@/lib/contact-timing/bestTime'
import { fetchChatMessages } from '@/lib/chat-messages/read'

const NEUTRAL_RHYTHM = { level: 'unknown', score: 0, reason: '', activeWindows: [], nextWindowText: null, recencyHours: null, inBurst: false, sampleSize: 0 }

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function err(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

const SELECT = 'id, person_id, kind, detail, source, observed_at, expires_at'
const KINDS: ContactSignalKind[] = ['traveling', 'busy', 'away', 'focus', 'available', 'posting_burst', 'job_change', 'life_event', 'other']
const SOURCES: ContactSignalSource[] = ['manual', 'instagram', 'linkedin', 'whatsapp', 'inferred']

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado', 'Inicia sesión y reinténtalo.')
  const personId = req.nextUrl.searchParams.get('person_id')
  if (!personId) return err(400, 'person_id requerido')
  try {
    const { data, error } = await supabase
      .from('contact_activity')
      .select(SELECT)
      .eq('user_id', auth.user.id)
      .eq('person_id', personId)
      .order('observed_at', { ascending: false })
      .limit(50)
    if (error) throw error
    const signals = (data ?? []).map((r) => rowToContactSignal(r as Record<string, unknown>))
    const now = Date.now()
    const verdict = assessContactTiming(signals, now)
    // Solo devolvemos las activas a la UI (las viejas ya no pesan).
    const active = signals.filter((s) => isSignalActive(s, now))
    // PROACTIVO (Frente B): "mejor momento" desde los timestamps del historial.
    // Fail-soft: sin sustrato → ritmo 'unknown'.
    let rhythm = NEUTRAL_RHYTHM as ReturnType<typeof analyzeContactRhythm>
    try {
      const rows = await fetchChatMessages(supabase, auth.user.id, personId, 600)
      const events: ChatEvent[] = rows
        .map((r) => ({ fromUser: r.sender === 'user', at: r.sent_at ?? '' }))
        .filter((e) => e.at)
      rhythm = analyzeContactRhythm(events, now)
    } catch { /* sin sustrato → unknown */ }
    return NextResponse.json({ verdict, signals: active, rhythm })
  } catch {
    // Tabla 0150 aún no propagada → sin veredicto (no rompe la ficha).
    return NextResponse.json({ verdict: { level: 'neutral', reason: '', drivingKind: null, until: null }, signals: [], rhythm: NEUTRAL_RHYTHM })
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado', 'Inicia sesión y reinténtalo.')
  let body: { person_id?: unknown; kind?: unknown; detail?: unknown; source?: unknown; expires_at?: unknown }
  try { body = (await req.json()) as typeof body } catch { return err(400, 'Body inválido') }
  const personId = typeof body.person_id === 'string' ? body.person_id : ''
  const kind = KINDS.includes(body.kind as ContactSignalKind) ? (body.kind as ContactSignalKind) : null
  const detail = typeof body.detail === 'string' ? body.detail.slice(0, 200).trim() || null : null
  const source = SOURCES.includes(body.source as ContactSignalSource) ? (body.source as ContactSignalSource) : 'manual'
  const expiresAt = typeof body.expires_at === 'string' && !Number.isNaN(Date.parse(body.expires_at)) ? body.expires_at : null
  if (!personId || !kind) return err(400, 'person_id y kind válidos requeridos')
  const { data, error } = await supabase
    .from('contact_activity')
    .insert({ user_id: auth.user.id, person_id: personId, kind, detail, source, expires_at: expiresAt })
    .select(SELECT)
    .single()
  if (error) return err(500, 'No se pudo registrar la señal', error.message)
  return NextResponse.json({ signal: rowToContactSignal(data as Record<string, unknown>) })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado', 'Inicia sesión y reinténtalo.')
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return err(400, 'id requerido')
  const { error } = await supabase.from('contact_activity').delete().eq('user_id', auth.user.id).eq('id', id)
  if (error) return err(500, 'No se pudo borrar la señal', error.message)
  return NextResponse.json({ ok: true })
}
