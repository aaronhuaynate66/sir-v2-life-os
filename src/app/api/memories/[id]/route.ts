// SIR V2 — PATCH /api/memories/[id]
//
// Descartar (soft-delete) una memoria derivada mala desde la ficha. Marca
// is_obsolete=true; la memoria deja de aparecer (getMemoriesForPerson filtra
// is_obsolete=false). Soft-delete a propósito: la derivación es idempotente
// por el PK determinístico, así que la fila queda como tombstone para que
// "Derivar desde mis conversaciones" NO la resucite.
//
// RLS + .eq('user_id') explícito garantizan que el user solo toca lo suyo.
//
// Body JSON: { is_obsolete: boolean, obsoleted_reason?: string }
// Response 200: { ok: true, id: string }
//
// NOTA: requiere la migration 0045 (memories.is_obsolete). Sin ella, el
// UPDATE falla y devolvemos un 503 con mensaje claro en vez de un 500 opaco.

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface PatchBody {
  is_obsolete?: unknown
  obsoleted_reason?: unknown
}

interface ErrorBody {
  error: string
  detail?: string
}

function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

/** Código de Postgres para "columna inexistente" (migration 0045 sin correr). */
function isMissingColumn(message: string | undefined): boolean {
  if (!message) return false
  const m = message.toLowerCase()
  return m.includes('is_obsolete') && (m.includes('does not exist') || m.includes('column'))
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }

  const { id } = await ctx.params
  if (!id || typeof id !== 'string' || id.length < 1) {
    return errorJson(400, 'id invalido')
  }

  let body: PatchBody
  try {
    body = (await req.json()) as PatchBody
  } catch {
    return errorJson(400, 'Body JSON invalido')
  }

  if (typeof body.is_obsolete !== 'boolean') {
    return errorJson(400, 'is_obsolete debe ser boolean')
  }

  const update: Record<string, unknown> = { is_obsolete: body.is_obsolete }
  if (body.is_obsolete) {
    update.obsoleted_at = new Date().toISOString()
    update.obsoleted_reason =
      typeof body.obsoleted_reason === 'string' && body.obsoleted_reason.trim()
        ? body.obsoleted_reason.trim().slice(0, 200)
        : 'descartada por el usuario'
  } else {
    update.obsoleted_at = null
    update.obsoleted_reason = null
  }

  // RLS deja pasar solo rows del user; .eq('user_id') es defensivo. Un id
  // ajeno → 0 rows → 404.
  const { data, error } = await supabase
    .from('memories')
    .update(update)
    .eq('id', id)
    .eq('user_id', authData.user.id)
    .select('id')
    .single()

  if (error) {
    if (isMissingColumn(error.message)) {
      return errorJson(
        503,
        'Falta correr la migración 0045',
        'La columna memories.is_obsolete no existe todavía. Corré supabase/migrations/0045_memories_is_obsolete.sql y reintentá.',
      )
    }
    return errorJson(404, 'Memoria no encontrada o sin permiso', error.message)
  }
  if (!data) {
    return errorJson(404, 'Memoria no encontrada o sin permiso')
  }

  return NextResponse.json({ ok: true, id: (data as { id: string }).id }, { status: 200 })
}
