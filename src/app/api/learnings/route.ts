// SIR V2 — GET/POST /api/learnings (Fase 3d: lecciones durables sobre Aaron)
//
// GET  → lista las lecciones (activas por default; ?all=1 incluye archivadas).
// POST → agrega una lección a mano (fuente 'manual'). Auth-gated, RLS por dueño.
// TOLERANTE: sin la tabla 0140 → GET devuelve lista vacía en vez de 500.

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'
import { learningRowToDto, normalizeLearningKind, normalizeLearningConfidence, type LearningDbRow } from '@/lib/learnings/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SELECT_COLS = 'id, text, kind, source, confidence, is_active, reinforced_count, created_at'

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')

  const all = req.nextUrl.searchParams.get('all') === '1'
  try {
    let q = supabase.from('learnings').select(SELECT_COLS).eq('user_id', auth.user.id)
    if (!all) q = q.eq('is_active', true)
    const { data, error } = await q.order('reinforced_count', { ascending: false }).order('created_at', { ascending: false }).limit(200)
    if (error) return NextResponse.json({ learnings: [] }) // tabla ausente → vacío
    return NextResponse.json({ learnings: (data as LearningDbRow[]).map(learningRowToDto) })
  } catch {
    return NextResponse.json({ learnings: [] })
  }
}

interface PostBody { text?: unknown; kind?: unknown; confidence?: unknown }

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')

  let body: PostBody
  try { body = (await req.json()) as PostBody } catch { return errorJson(400, 'Body inválido') }
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 500) : ''
  if (!text) return errorJson(400, 'Falta el texto de la lección')

  try {
    const { data, error } = await supabase.from('learnings').insert({
      user_id: auth.user.id,
      text,
      kind: normalizeLearningKind(body.kind),
      source: 'manual',
      confidence: normalizeLearningConfidence(body.confidence),
    }).select(SELECT_COLS).maybeSingle()
    if (error) return errorJson(500, 'No se pudo guardar', error.message.slice(0, 200))
    return NextResponse.json({ learning: learningRowToDto(data as LearningDbRow) }, { status: 201 })
  } catch (e) {
    reportApiError(e, { route: 'learnings' })
    return errorJson(500, 'No se pudo guardar')
  }
}
