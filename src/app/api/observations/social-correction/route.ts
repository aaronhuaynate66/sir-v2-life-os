// SIR V2 — POST /api/observations/social-correction
//
// "Si no se puede cambiar, se crea para poder cambiarlo": corrige A MANO los
// contadores (followers/following/posts) y/o la bio de un perfil social cuando
// la captura los leyó mal (caso Diana: 1543 en vez de 1343, bio equivocada),
// SIN tener que re-capturar. Crea una observación `source:'manual_correction'`
// con los valores corregidos —heredando el resto de la última captura buena
// (handle, displayName, seguidores en común)— que se vuelve la más nueva y
// recompone el eje social/profesional. PURA DB, sin LLM. Auth + RLS.
//
// Body: { personId, captureType?='instagram', followersCount?, followingCount?,
//         postsCount?, bio? }  (al menos uno de los corregibles)
// Response 201: { observation }

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { insertObservation } from '@/lib/capture/observations/insert'
import { recomputeAxisFor, axisForCapture } from '@/lib/person-axes/recompute'
import type { CaptureType } from '@/lib/capture/observations/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Entero no-negativo o undefined (no lo tocamos). */
function intOrUndef(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return undefined
  return Math.round(v)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const userId = authData.user.id

  let body: Record<string, unknown>
  try { body = (await req.json()) as Record<string, unknown> } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const personId = typeof body.personId === 'string' && body.personId.trim() ? body.personId.trim() : null
  if (!personId) return NextResponse.json({ error: 'personId requerido' }, { status: 400 })
  const captureType: CaptureType = body.captureType === 'linkedin' ? 'linkedin' : 'instagram'

  const followersCount = intOrUndef(body.followersCount)
  const followingCount = intOrUndef(body.followingCount)
  const postsCount = intOrUndef(body.postsCount)
  const bio = typeof body.bio === 'string' ? body.bio.trim().slice(0, 500) : undefined
  if (followersCount === undefined && followingCount === undefined && postsCount === undefined && bio === undefined) {
    return NextResponse.json({ error: 'Nada para corregir' }, { status: 400 })
  }

  // Heredar el resto de la última captura NO obsoleta (handle, displayName,
  // seguidores en común, etc.) para no perder data buena.
  const { data: latest } = await supabase
    .from('observations')
    .select('data')
    .eq('user_id', userId)
    .eq('person_id', personId)
    .eq('capture_type', captureType)
    .eq('is_obsolete', false)
    .order('observed_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const base = (latest?.data && typeof latest.data === 'object' ? latest.data : {}) as Record<string, unknown>

  const data: Record<string, unknown> = { ...base, source: 'manual_correction', confidence: 'high' }
  if (followersCount !== undefined) data.followersCount = followersCount
  if (followingCount !== undefined) data.followingCount = followingCount
  if (postsCount !== undefined) data.postsCount = postsCount
  if (bio !== undefined) data.bio = bio

  try {
    const observation = await insertObservation(supabase, {
      userId,
      personId,
      captureType,
      sourceImagePath: null,
      storageBucket: null,
      data,
      detectorData: null,
      confidence: 'high',
      observedAt: new Date().toISOString(),
      needsReview: false,
    })
    // Recompone el eje desde esta corrección (que ahora es la más nueva).
    const axis = axisForCapture(captureType)
    if (axis) {
      try { await recomputeAxisFor(supabase, userId, personId, axis) } catch { /* best-effort */ }
    }
    return NextResponse.json({ observation }, { status: 201 })
  } catch (e) {
    return NextResponse.json(
      { error: 'No se pudo guardar la corrección', detail: e instanceof Error ? e.message.slice(0, 200) : undefined },
      { status: 500 },
    )
  }
}
