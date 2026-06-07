// SIR V2 — PATCH /api/memories/[id]
//
// Dos acciones de soft-state sobre una memoria derivada, desde la ficha:
//
//   1. DESCARTAR (is_obsolete, mig 0045): mala derivación. Se oculta y queda
//      como tombstone para que "Derivar" no la resucite.
//   2. PRIVADA/EXCLUIR (is_private, mig 0064): hecho real pero sensible. Se
//      conserva (visible bajo el affordance "privadas") pero se EXCLUYE de toda
//      IA y de la vista general; la re-derivación suprime equivalentes por firma
//      para no resucitarla. Reversible (is_private=false la devuelve a la vista).
//
// RLS + .eq('user_id') explícito garantizan que el user solo toca lo suyo.
//
// Body JSON (al menos uno):
//   { is_obsolete?: boolean, obsoleted_reason?: string, is_private?: boolean }
// Response 200: { ok: true, id: string }
//
// NOTA: is_obsolete requiere 0045; is_private requiere 0064. Sin la columna, el
// UPDATE falla y devolvemos un 503 con mensaje claro en vez de un 500 opaco.

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface PatchBody {
  is_obsolete?: unknown
  obsoleted_reason?: unknown
  is_private?: unknown
}

interface ErrorBody {
  error: string
  detail?: string
}

function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

/** Código de Postgres para "columna inexistente" (0045 / 0064 sin correr). */
function isMissingColumn(message: string | undefined, column: string): boolean {
  if (!message) return false
  const m = message.toLowerCase()
  return m.includes(column) && (m.includes('does not exist') || m.includes('column'))
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

  const hasObsolete = typeof body.is_obsolete === 'boolean'
  const hasPrivate = typeof body.is_private === 'boolean'
  if (!hasObsolete && !hasPrivate) {
    return errorJson(400, 'Enviá is_obsolete y/o is_private (boolean)')
  }

  const update: Record<string, unknown> = {}
  if (hasObsolete) {
    update.is_obsolete = body.is_obsolete
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
  }
  if (hasPrivate) {
    update.is_private = body.is_private
    update.made_private_at = body.is_private ? new Date().toISOString() : null
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
    if (isMissingColumn(error.message, 'is_private') || isMissingColumn(error.message, 'made_private_at')) {
      return errorJson(
        503,
        'Falta correr la migración 0064',
        'La columna memories.is_private no existe todavía. Corré supabase/migrations/0064_memories_is_private.sql y reintentá.',
      )
    }
    if (isMissingColumn(error.message, 'is_obsolete')) {
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
