// SIR V2 — POST /api/reset-imports. Borra SOLO lo derivado de importaciones,
// por alcance elegido, para re-importar limpio. CONSERVA lo manual: personas,
// vínculos/árbol, episodios (relationship_moments), objetivos, salud, deals.
// Exige confirm:true. Irreversible — lo dispara el usuario desde la UI.
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Scope = 'conversations' | 'archives' | 'interactions' | 'memories' | 'dates' | 'identities'
const VALID: Scope[] = ['conversations', 'archives', 'interactions', 'memories', 'dates', 'identities']

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const uid = auth.user.id
  let b: { scopes?: unknown; confirm?: unknown }
  try { b = (await req.json()) as typeof b } catch { return NextResponse.json({ error: 'Body inválido' }, { status: 400 }) }
  if (b.confirm !== true) return NextResponse.json({ error: 'Falta confirmación' }, { status: 400 })
  const scopes = (Array.isArray(b.scopes) ? b.scopes : []).filter((s): s is Scope => VALID.includes(s as Scope))
  if (scopes.length === 0) return NextResponse.json({ error: 'Sin alcances' }, { status: 400 })

  const done: Record<string, number | string> = {}

  try {
    if (scopes.includes('conversations')) {
      const { count } = await supabase.from('observations').select('id', { count: 'exact', head: true }).eq('user_id', uid).in('capture_type', ['whatsapp_chat', 'whatsapp_info'])
      await supabase.from('observations').delete().eq('user_id', uid).in('capture_type', ['whatsapp_chat', 'whatsapp_info'])
      done.conversations = count ?? 0
    }
    if (scopes.includes('archives')) {
      const { count } = await supabase.from('conversation_archives').select('id', { count: 'exact', head: true }).eq('user_id', uid)
      await supabase.from('conversation_archives').delete().eq('user_id', uid)
      done.archives = count ?? 0
    }
    if (scopes.includes('interactions')) {
      const orPat = 'note.ilike.Importado%,note.ilike.Tono inferido del chat%,note.ilike.Conversación reciente%,note.ilike.Llamada%,note.ilike.Videollamada%'
      const { count } = await supabase.from('person_logs').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('kind', 'interaction').or(orPat)
      await supabase.from('person_logs').delete().eq('user_id', uid).eq('kind', 'interaction').or(orPat)
      done.interactions = count ?? 0
    }
    if (scopes.includes('memories')) {
      const orPat = 'observation_id.not.is.null,source.ilike.%whatsapp%,source.ilike.%chat%'
      const { count } = await supabase.from('memories').select('id', { count: 'exact', head: true }).eq('user_id', uid).or(orPat)
      await supabase.from('memories').delete().eq('user_id', uid).or(orPat)
      done.memories = count ?? 0
    }
    if (scopes.includes('dates')) {
      const { count } = await supabase.from('people').select('id', { count: 'exact', head: true }).eq('user_id', uid)
      await supabase.from('people').update({ special_dates: [] }).eq('user_id', uid)
      done.dates = `fechas limpiadas en ${count ?? 0} personas`
    }
    if (scopes.includes('identities')) {
      let n = 0
      try { const { count } = await supabase.from('person_identities').select('id', { count: 'exact', head: true }).eq('user_id', uid); n += count ?? 0; await supabase.from('person_identities').delete().eq('user_id', uid) } catch { /* */ }
      try { await supabase.from('chat_identities').delete().eq('user_id', uid) } catch { /* */ }
      done.identities = n
    }
    return NextResponse.json({ ok: true, done })
  } catch (e) {
    return NextResponse.json({ error: 'Falló el reset', detail: String(e).slice(0, 160), done }, { status: 500 })
  }
}
