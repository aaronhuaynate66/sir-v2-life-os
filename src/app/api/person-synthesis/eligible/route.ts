// SIR V2 — GET /api/person-synthesis/eligible
//
// Lista las personas cuyo hilo YA vive en el sustrato canónico (chat_messages,
// mig 0141) con material suficiente para regenerar "Lo personal" desde el
// transcript real. Alimenta el botón "actualizar todas" de /relaciones: el
// cliente itera este set llamando al POST /api/person-synthesis (sustrato-first).
//
// Response 200: { people: [{ personId, name, msgCount }], threshold }
//
// Cuenta por persona con HEAD count (barato, índice (user_id, person_id, sent_at)).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/** Mismo piso que usa el POST para sintetizar desde el sustrato. */
const MIN_SUBSTRATE_MSGS = 30

export async function GET() {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const userId = authData.user.id

  const { data: peopleRows, error: peopleErr } = await supabase
    .from('people')
    .select('id, name')
    .eq('user_id', userId)
    .limit(1000)
  if (peopleErr) {
    return NextResponse.json({ error: 'No se pudieron leer las personas', detail: peopleErr.message }, { status: 500 })
  }

  const people = (peopleRows ?? []) as Array<{ id: string; name: string | null }>

  // Conteo por persona en paralelo (HEAD count). 24 personas → 24 counts rápidos.
  const counts = await Promise.all(
    people.map(async (p) => {
      const { count } = await supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('person_id', p.id)
      return { personId: p.id, name: p.name ?? 'sin nombre', msgCount: count ?? 0 }
    }),
  )

  const eligible = counts
    .filter((c) => c.msgCount >= MIN_SUBSTRATE_MSGS)
    .sort((a, b) => b.msgCount - a.msgCount)

  return NextResponse.json({ people: eligible, threshold: MIN_SUBSTRATE_MSGS }, { status: 200 })
}
