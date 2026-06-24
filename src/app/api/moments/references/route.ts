// SIR V2 — /api/moments/references (Paso 3). Rastrea referencias del episodio
// en las conversaciones archivadas y guarda las CONFIRMADAS por el usuario.
// relationship_moments / moment_references no están en el tipo generado → .from().
// GET  ?moment_id=            → referencias confirmadas (el alcance)
// GET  ?moment_id=&scan=1[&q=] → barre conversation_archives por las keywords del
//                               episodio (o q override) y devuelve CANDIDATOS
// POST { moment_id, person_id, snippet?, ref_date? }
// DELETE ?id=  |  ?moment_id=&person_id=  (quita todas las de esa persona)
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { searchArchive } from '@/lib/conversation/search'
import { episodeKeywords } from '@/lib/moments/keywords'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Candidate { personId: string; personName: string; isParticipant: boolean; count: number; hits: { date: string | null; snippet: string }[] }

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const uid = auth.user.id
  const momentId = req.nextUrl.searchParams.get('moment_id')
  if (!momentId) return NextResponse.json({ error: 'moment_id requerido' }, { status: 400 })
  const scan = req.nextUrl.searchParams.get('scan') === '1'

  if (!scan) {
    try {
      const { data } = await supabase.from('moment_references').select('id, person_id, snippet, ref_date').eq('user_id', uid).eq('moment_id', momentId).order('created_at', { ascending: false }).limit(200)
      return NextResponse.json({ references: data ?? [] })
    } catch { return NextResponse.json({ references: [] }) }
  }

  // BARRIDO. Keywords del episodio (o q override).
  try {
    const { data: mrow } = await supabase.from('relationship_moments').select('title, detail').eq('user_id', uid).eq('id', momentId).maybeSingle()
    const m = mrow as { title?: string; detail?: string } | null
    const qOverride = (req.nextUrl.searchParams.get('q') || '').trim()
    const keywords = qOverride ? qOverride.split(/[,\s]+/).filter((w) => w.length >= 2) : episodeKeywords(m?.title ?? '')
    if (keywords.length === 0) return NextResponse.json({ candidates: [], keywords: [] })

    // Participantes actuales (primaria + extra) para marcarlos.
    const participants = new Set<string>()
    try {
      const { data: prim } = await supabase.from('relationship_moments').select('person_id').eq('user_id', uid).eq('id', momentId).maybeSingle()
      if (prim && (prim as { person_id?: string }).person_id) participants.add((prim as { person_id: string }).person_id)
      const { data: parts } = await supabase.from('moment_participants').select('person_id').eq('user_id', uid).eq('moment_id', momentId)
      for (const p of (parts ?? []) as Array<{ person_id: string }>) participants.add(p.person_id)
    } catch { /* */ }

    // Archivos de conversación + nombres.
    const { data: archives } = await supabase.from('conversation_archives').select('person_id, raw_text').eq('user_id', uid).limit(200)
    const rows = (archives ?? []) as Array<{ person_id: string; raw_text: string }>
    const ids = Array.from(new Set(rows.map((r) => r.person_id)))
    const nameById = new Map<string, string>()
    if (ids.length) {
      const { data: people } = await supabase.from('people').select('id, name').eq('user_id', uid).in('id', ids)
      for (const p of (people ?? []) as Array<{ id: string; name: string }>) nameById.set(p.id, p.name)
    }

    const candidates: Candidate[] = []
    for (const r of rows) {
      const seen = new Set<string>()
      const hits: { date: string | null; snippet: string }[] = []
      for (const kw of keywords) {
        for (const h of searchArchive(r.raw_text, kw, 6)) {
          const key = h.snippet.slice(0, 80)
          if (seen.has(key)) continue
          seen.add(key)
          hits.push(h)
          if (hits.length >= 5) break
        }
        if (hits.length >= 5) break
      }
      if (hits.length > 0) {
        candidates.push({ personId: r.person_id, personName: nameById.get(r.person_id) ?? 'alguien', isParticipant: participants.has(r.person_id), count: hits.length, hits })
      }
    }
    candidates.sort((a, b) => b.count - a.count)
    return NextResponse.json({ candidates: candidates.slice(0, 25), keywords })
  } catch (e) {
    return NextResponse.json({ candidates: [], error: String(e).slice(0, 120) })
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let b: Record<string, unknown>
  try { b = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const momentId = typeof b.moment_id === 'string' ? b.moment_id : ''
  const personId = typeof b.person_id === 'string' ? b.person_id : ''
  if (!momentId || !personId) return NextResponse.json({ error: 'moment_id y person_id requeridos' }, { status: 400 })
  const snippet = typeof b.snippet === 'string' ? b.snippet.slice(0, 400) : null
  const ref_date = typeof b.ref_date === 'string' ? b.ref_date.slice(0, 20) : null
  try {
    const { data, error } = await supabase.from('moment_references').insert({ user_id: auth.user.id, moment_id: momentId, person_id: personId, snippet, ref_date }).select('id, person_id, snippet, ref_date').single()
    if (error) return NextResponse.json({ error: 'No se pudo guardar', detail: error.message }, { status: 500 })
    return NextResponse.json({ reference: data })
  } catch (e) { return NextResponse.json({ error: 'No se pudo guardar', detail: String(e).slice(0, 120) }, { status: 500 }) }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const uid = auth.user.id
  const id = req.nextUrl.searchParams.get('id')
  const momentId = req.nextUrl.searchParams.get('moment_id')
  const personId = req.nextUrl.searchParams.get('person_id')
  try {
    if (id) await supabase.from('moment_references').delete().eq('user_id', uid).eq('id', id)
    else if (momentId && personId) await supabase.from('moment_references').delete().eq('user_id', uid).eq('moment_id', momentId).eq('person_id', personId)
    else return NextResponse.json({ error: 'id o (moment_id+person_id) requerido' }, { status: 400 })
  } catch { /* */ }
  return NextResponse.json({ ok: true })
}
