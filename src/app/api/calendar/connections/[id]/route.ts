// SIR V2 — PATCH/DELETE /api/calendar/connections/[id] (Calendar v2 Fase 1)
//
// Editar (label/color/icsUrl), togglear (enabled) o eliminar un calendario
// conectado. RLS + .eq('user_id') explícito: el user solo toca lo suyo.
//
// SENSIBLE: ics_url lleva token privado → no se loguea. reportApiError captura
// la excepción, jamás el body.

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'
import {
  rowToDto,
  normalizeColor,
  normalizeLabel,
  validateIcsUrl,
  type CalendarConnectionRow,
} from '@/lib/calendar/connections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SELECT_COLS = 'id, label, provider, ics_url, color, enabled, created_at'

function errorJson(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

interface PatchBody {
  label?: unknown
  icsUrl?: unknown
  color?: unknown
  enabled?: unknown
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }

  const { id } = await ctx.params
  if (!id || typeof id !== 'string') return errorJson(400, 'id inválido')

  let body: PatchBody
  try {
    body = (await req.json()) as PatchBody
  } catch {
    return errorJson(400, 'Body inválido')
  }

  // Patch parcial: solo se actualiza lo que viene. Cada campo se valida.
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.label !== undefined) update.label = normalizeLabel(body.label)
  if (body.color !== undefined) update.color = normalizeColor(body.color)
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== 'boolean') return errorJson(400, 'enabled debe ser boolean')
    update.enabled = body.enabled
  }
  if (body.icsUrl !== undefined) {
    const urlCheck = validateIcsUrl(body.icsUrl)
    if (!urlCheck.ok) return errorJson(400, urlCheck.reason ?? 'URL inválida')
    update.ics_url = urlCheck.url
  }

  // Nada que actualizar más allá del timestamp → no hay cambios reales.
  if (Object.keys(update).length === 1) return errorJson(400, 'Nada para actualizar')

  try {
    const { data, error } = await supabase
      .from('calendar_connections')
      .update(update)
      .eq('id', id)
      .eq('user_id', authData.user.id)
      .select(SELECT_COLS)
      .maybeSingle()
    if (error) return errorJson(500, 'No se pudo actualizar', error.message.slice(0, 200))
    if (!data) return errorJson(404, 'Calendario no encontrado')
    return NextResponse.json({ connection: rowToDto(data as CalendarConnectionRow) })
  } catch (e) {
    reportApiError(e)
    return errorJson(500, 'No se pudo actualizar')
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }

  const { id } = await ctx.params
  if (!id || typeof id !== 'string') return errorJson(400, 'id inválido')

  try {
    const { error } = await supabase
      .from('calendar_connections')
      .delete()
      .eq('id', id)
      .eq('user_id', authData.user.id)
    if (error) return errorJson(500, 'No se pudo eliminar', error.message.slice(0, 200))
    return NextResponse.json({ ok: true, id })
  } catch (e) {
    reportApiError(e)
    return errorJson(500, 'No se pudo eliminar')
  }
}
