// SIR V2 — GET /api/observations/profile-history?person_id=...&type=instagram
// Historial de métricas de un perfil social (seguidores/seguidos/posts) a lo
// largo de las capturas. EXCLUYE las obsoletas: las capturas de Instagram/LinkedIn
// NO se reemplazan entre sí (cada una es un punto del historial), así que una
// obsoleta = una captura DESCARTADA (mala/alucinada, ej. la que leyó 1543 en vez
// de 1343). Incluirla metía un pico falso en la variación. Auth + RLS.
// Response: { points: { observedAt, followers, following, posts }[] }

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

const ALLOWED = new Set(['instagram', 'whatsapp_info', 'linkedin'])

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const personId = req.nextUrl.searchParams.get('person_id')
  const type = req.nextUrl.searchParams.get('type') ?? 'instagram'
  if (!personId) return NextResponse.json({ error: 'person_id requerido' }, { status: 400 })
  if (!ALLOWED.has(type)) return NextResponse.json({ error: 'type inválido' }, { status: 400 })

  const { data, error } = await supabase
    .from('observations')
    .select('data, observed_at')
    .eq('user_id', auth.user.id)
    .eq('person_id', personId)
    .eq('capture_type', type)
    .eq('is_obsolete', false) // excluir capturas descartadas (ej. la que alucinó 1543)
    .order('observed_at', { ascending: true })
    .limit(500)
  if (error) return NextResponse.json({ error: 'No se pudo leer el historial', detail: error.message }, { status: 500 })

  const points = ((data ?? []) as Array<{ data: Record<string, unknown> | null; observed_at: string }>)
    .map((r) => {
      const d = r.data ?? {}
      return {
        observedAt: r.observed_at,
        followers: num(d.followersCount),
        following: num(d.followingCount),
        posts: num(d.postsCount),
      }
    })
    .filter((p) => p.followers !== null || p.following !== null || p.posts !== null)
  return NextResponse.json({ points }, { status: 200 })
}
