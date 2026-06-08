// SIR V2 — POST /api/person-score/snapshot
//
// Persiste el SNAPSHOT DIARIO del score relacional de una persona (tabla
// person_score_snapshots, migración 0066) e idempotente por (user, persona,
// día). Devuelve los snapshots recientes para que el cliente compute la
// tendencia (computeScoreTrend) en una sola llamada.
//
// El score se computa client-side (relationalScore.ts, puro) y se envía acá;
// la fila queda RLS-scoped al usuario (datos propios sobre personas propias).
//
// FAIL-OPEN: si la tabla aún no existe (ventana entre deploy de código y
// aplicación de la migración por el runner), responde 200 con snapshots:[] y
// persisted:false — NO rompe la ficha (la captura es fire-and-forget).
//
// Body JSON: { person_id, global, fuerza, reciprocidad?, confianza, daysSinceLastChat? }
// Response 200: { persisted: boolean, snapshots: { dateBucket, global }[] }

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 15

interface ErrorBody {
  error: string
  detail?: string
}
function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

function clampInt(n: unknown, lo: number, hi: number): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  return Math.max(lo, Math.min(hi, Math.round(n)))
}

const RECENT_LIMIT = 30

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }
  const userId = authData.user.id

  let body: {
    person_id?: unknown
    global?: unknown
    fuerza?: unknown
    reciprocidad?: unknown
    confianza?: unknown
    daysSinceLastChat?: unknown
  }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return errorJson(400, 'Body JSON invalido')
  }
  if (typeof body.person_id !== 'string' || body.person_id.length === 0) {
    return errorJson(400, 'person_id requerido (string no vacio)')
  }
  const personId = body.person_id

  const global = clampInt(body.global, 0, 100)
  const fuerza = clampInt(body.fuerza, 0, 100)
  const confianza = clampInt(body.confianza, 0, 100)
  if (global === null || fuerza === null || confianza === null) {
    return errorJson(400, 'global, fuerza y confianza son requeridos (0-100)')
  }
  const reciprocidad = body.reciprocidad === null || body.reciprocidad === undefined ? null : clampInt(body.reciprocidad, 0, 100)
  const daysSinceLastChat =
    body.daysSinceLastChat === null || body.daysSinceLastChat === undefined ? null : clampInt(body.daysSinceLastChat, 0, 100000)

  // Ownership: la persona es del usuario.
  const { data: personRow, error: personErr } = await supabase
    .from('people')
    .select('id')
    .eq('user_id', userId)
    .eq('id', personId)
    .maybeSingle()
  if (personErr) {
    return errorJson(500, 'No se pudo verificar la persona', personErr.message)
  }
  if (!personRow) {
    return errorJson(404, 'Persona no encontrada o sin permiso')
  }

  const dateBucket = new Date().toISOString().slice(0, 10) // YYYY-MM-DD (UTC)

  // Upsert idempotente por (user_id, person_id, date_bucket). FAIL-OPEN ante
  // tabla ausente: el catch de abajo devuelve snapshots:[] sin romper.
  let persisted = false
  try {
    const { error: upsertErr } = await supabase
      .from('person_score_snapshots')
      .upsert(
        {
          user_id: userId,
          person_id: personId,
          date_bucket: dateBucket,
          global,
          fuerza,
          reciprocidad,
          confianza,
          days_since_last_chat: daysSinceLastChat,
        },
        { onConflict: 'user_id,person_id,date_bucket' },
      )
    if (!upsertErr) persisted = true

    const { data: rows } = await supabase
      .from('person_score_snapshots')
      .select('date_bucket, global')
      .eq('user_id', userId)
      .eq('person_id', personId)
      .order('date_bucket', { ascending: false })
      .limit(RECENT_LIMIT)

    const snapshots = (rows ?? []).map((r) => ({
      dateBucket: (r as { date_bucket: string }).date_bucket,
      global: (r as { global: number }).global,
    }))
    return NextResponse.json({ persisted, snapshots }, { status: 200 })
  } catch {
    // Tabla ausente u otro fallo de DB: degradar limpio.
    return NextResponse.json({ persisted: false, snapshots: [] }, { status: 200 })
  }
}
