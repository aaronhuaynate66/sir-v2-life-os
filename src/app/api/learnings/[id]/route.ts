// SIR V2 — PATCH/DELETE /api/learnings/[id] (Fase 3d)
//
// PATCH: editar el texto o archivar/reactivar (is_active). DELETE: borrar.
// RLS + .eq('user_id') explícito. Aaron controla lo que SIR "sabe" de él.

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'
import { learningRowToDto, normalizeLearningKind, type LearningDbRow } from '@/lib/learnings/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SELECT_COLS = 'id, text, kind, source, confidence, is_active, reinforced_count, created_at'

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

interface PatchBody { text?: unknown; kind?: unknown; isActive?: unknown }

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return errorJson(401, 'No autenticado')
  if (!id) return errorJson(400, 'Falta el id')

  let body: PatchBody
  try { body = (await req.json()) as PatchBody } catch { return errorJson(400, 'Body inválido') }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.text === 'string' && body.text.trim()) patch.text = body.text.trim().slice(0, 500)
  if (body.kind !== undefined) patch.kind = normalizeLearningKind(body.kind)
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') return errorJson(400, 'isActive debe ser boolean')
    patch.is_active = body.isActive
  }
  if (Object.keys(patch).length === 1) return errorJson(400, 'Nada para actualizar')

  try {
    const { data, error } = await supabase
      .from('learnings').update(patch).eq('id', id).eq('user_id', auth.user.id)
      .select(SELECT_COLS).maybeSingle()
    if (error) return errorJson(500, 'No se pudo actualizar', error.message.slice(0, 200))
    if (!data) return errorJson(404, 'No encontré esa lección')
    return NextResponse.json({ learning: learningRowToDto(data as LearningDbRow) })
  } catch (e) {
    reportApiError(e, { route: 'learnings/[id]', stage: 'patch' })
    return errorJson(500, 'No se pudo actualizar')
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user) return errorJson(401, 'No autenticado')
  if (!id) return errorJson(400, 'Falta el id')

  try {
    const { error } = await supabase.from('learnings').delete().eq('id', id).eq('user_id', auth.user.id)
    if (error) return errorJson(500, 'No se pudo borrar', error.message.slice(0, 200))
    return NextResponse.json({ ok: true })
  } catch (e) {
    reportApiError(e, { route: 'learnings/[id]', stage: 'delete' })
    return errorJson(500, 'No se pudo borrar')
  }
}
