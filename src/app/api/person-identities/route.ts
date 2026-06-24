// SIR V2 — /api/person-identities. Alias/identidad por red → persona, para
// homologar zips/capturas (mig 0097). person_identities no está en el tipo
// generado → .from() directo. RLS.
// GET  ?person_id=            → identidades de esa persona
// GET  ?network=&names=a,b,c  → resolver: si UNA sola persona matchea (exacto,
//                               normalizado) y no hay ambigüedad → {personId, personName}
// POST { person_id, network, identifier }
// DELETE ?id=
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { mapIdentityRow, normIdentifier, isNetwork } from '@/lib/identities/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SELECT = 'id, person_id, network, identifier, identifier_norm'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const personId = req.nextUrl.searchParams.get('person_id')
  const network = req.nextUrl.searchParams.get('network')
  const names = req.nextUrl.searchParams.get('names')

  // Modo resolver: por red + lista de nombres candidatos (participantes del chat).
  if (network && names) {
    if (!isNetwork(network)) return NextResponse.json({ personId: null })
    const norms = Array.from(new Set(names.split(',').map((n) => normIdentifier(n)).filter(Boolean)))
    if (!norms.length) return NextResponse.json({ personId: null })
    try {
      const { data } = await supabase.from('person_identities')
        .select('person_id, identifier_norm')
        .eq('user_id', auth.user.id).eq('network', network).in('identifier_norm', norms)
      const ids = Array.from(new Set(((data ?? []) as Array<{ person_id: string }>).map((r) => r.person_id)))
      // Solo auto-resolver si NO hay ambigüedad: exactamente una persona.
      if (ids.length !== 1) return NextResponse.json({ personId: null, ambiguous: ids.length > 1 })
      const { data: prow } = await supabase.from('people').select('id, name').eq('user_id', auth.user.id).eq('id', ids[0]).maybeSingle()
      if (!prow) return NextResponse.json({ personId: null })
      return NextResponse.json({ personId: ids[0], personName: (prow as { name: string }).name })
    } catch { return NextResponse.json({ personId: null }) }
  }

  if (!personId) return NextResponse.json({ identities: [] })
  try {
    const { data } = await supabase.from('person_identities')
      .select(SELECT).eq('user_id', auth.user.id).eq('person_id', personId).order('created_at', { ascending: true })
    return NextResponse.json({ identities: (data ?? []).map(mapIdentityRow) })
  } catch { return NextResponse.json({ identities: [] }) }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  let b: Record<string, unknown>
  try { b = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  const personId = typeof b.person_id === 'string' ? b.person_id : ''
  const network = b.network
  const identifier = typeof b.identifier === 'string' ? b.identifier.trim().slice(0, 120) : ''
  if (!personId || !isNetwork(network) || !identifier) return NextResponse.json({ error: 'person_id, network e identifier requeridos' }, { status: 400 })
  const identifier_norm = normIdentifier(identifier)
  if (!identifier_norm) return NextResponse.json({ error: 'identifier vacío tras normalizar' }, { status: 400 })
  // Ownership de la persona.
  const { data: prow } = await supabase.from('people').select('id').eq('user_id', auth.user.id).eq('id', personId).maybeSingle()
  if (!prow) return NextResponse.json({ error: 'Persona no encontrada' }, { status: 404 })
  // Guarda contra ambigüedad: si ese (red, norm) ya existe para OTRA persona, no piso.
  try {
    const { data: clash } = await supabase.from('person_identities')
      .select('id, person_id').eq('user_id', auth.user.id).eq('network', network).eq('identifier_norm', identifier_norm).maybeSingle()
    if (clash && (clash as { person_id: string }).person_id !== personId) {
      return NextResponse.json({ error: `Ese alias en ${network} ya está asignado a otra persona.` }, { status: 409 })
    }
    if (clash) {
      // Ya existe para ESTA persona → idempotente.
      return NextResponse.json({ identity: { id: (clash as { id: string }).id, personId, network, identifier } })
    }
    const { data, error } = await supabase.from('person_identities')
      .insert({ user_id: auth.user.id, person_id: personId, network, identifier, identifier_norm }).select(SELECT).single()
    if (error) return NextResponse.json({ error: 'No se pudo guardar', detail: error.message }, { status: 500 })
    return NextResponse.json({ identity: mapIdentityRow(data) })
  } catch (e) {
    return NextResponse.json({ error: 'No se pudo guardar', detail: String(e).slice(0, 120) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  try { await supabase.from('person_identities').delete().eq('user_id', auth.user.id).eq('id', id) } catch { /* */ }
  return NextResponse.json({ ok: true })
}
