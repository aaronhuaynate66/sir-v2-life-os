// SIR V2 — PATCH /api/observations/[id]
//
// Endpoint minimo para actualizar la vinculacion persona ↔ observacion
// post-save (Sesion 2.7 BUG-002). Cuando el matcher no auto-linkea, la
// UI muestra candidatos; al clickear uno, llama acá.
//
// Solo permite cambiar campos seguros (`person_id` por ahora). RLS
// garantiza que el user solo puede tocar sus propias observations.
//
// Body JSON:
//   { person_id: string | null }
//
// Response 200: { observation: Observation }

import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { recomputeAxisFor, axisForCapture } from '@/lib/person-axes/recompute'
import { inferCyclesFromWhatsappData } from '@/lib/person-cycles/fromWhatsappObservation'
import type {
  CaptureType,
  Confidence,
  DetectorResult,
  Observation,
} from '@/lib/capture/observations/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface PatchBody {
  person_id?: unknown
  /** true = descartar la captura (is_obsolete=true → deja de alimentar las
   *  vistas curadas). false = restaurar. */
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

function toObservation(row: Record<string, unknown>): Observation {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    personId: (row.person_id as string | null) ?? null,
    captureType: row.capture_type as CaptureType,
    sourceImagePath: (row.source_image_path as string | null) ?? null,
    storageBucket: (row.storage_bucket as string | null) ?? null,
    data: (row.data as Record<string, unknown>) ?? {},
    detectorData: (row.detector_data as DetectorResult | null) ?? null,
    userEdits: (row.user_edits as Record<string, unknown> | null) ?? null,
    confidence: (row.confidence as Confidence | null) ?? null,
    needsReview: Boolean(row.needs_review),
    observedAt: row.observed_at as string,
    capturedAt: row.captured_at as string,
    isObsolete: Boolean(row.is_obsolete),
    obsoletedAt: (row.obsoleted_at as string | null) ?? null,
    obsoletedReason: (row.obsoleted_reason as string | null) ?? null,
    createdAt: row.created_at as string,
  }
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

  // Aceptamos person_id (vincular/desvincular) y/o is_obsolete (descartar/
  // restaurar la captura). Al menos uno debe venir.
  const hasPersonId = 'person_id' in body
  const hasObsolete = 'is_obsolete' in body
  if (!hasPersonId && !hasObsolete) {
    return errorJson(400, 'Falta person_id o is_obsolete en el body')
  }

  const update: Record<string, unknown> = {}

  if (hasPersonId) {
    if (body.person_id !== null && typeof body.person_id !== 'string') {
      return errorJson(400, 'person_id debe ser string o null')
    }
    update.person_id = body.person_id
  }

  if (hasObsolete) {
    if (typeof body.is_obsolete !== 'boolean') {
      return errorJson(400, 'is_obsolete debe ser boolean')
    }
    update.is_obsolete = body.is_obsolete
    if (body.is_obsolete) {
      update.obsoleted_at = new Date().toISOString()
      update.obsoleted_reason =
        typeof body.obsoleted_reason === 'string' && body.obsoleted_reason.trim()
          ? body.obsoleted_reason.trim().slice(0, 200)
          : 'descartada por el usuario'
    } else {
      // Restaurar: limpiar marcas de obsolescencia.
      update.obsoleted_at = null
      update.obsoleted_reason = null
    }
  }

  // RLS deja pasar solo rows del user. Si pasa un id ajeno -> 0 rows
  // afectadas y trataremos como 404.
  const { data, error } = await supabase
    .from('observations')
    .update(update)
    .eq('id', id)
    .eq('user_id', authData.user.id)
    .select('*')
    .single()

  if (error || !data) {
    return errorJson(404, 'Observation no encontrada o sin permiso', error?.message)
  }

  // Al DESCARTAR una captura de perfil, el eje social/profesional (un snapshot)
  // quedaría pegado con la data descartada. Lo regeneramos desde la última captura
  // buena que quede, o lo limpiamos. Best-effort: nunca rompe el descarte.
  if (hasObsolete && body.is_obsolete === true) {
    const row = data as Record<string, unknown>
    const captureType = typeof row.capture_type === 'string' ? row.capture_type : ''
    const pid = typeof row.person_id === 'string' ? row.person_id : null
    const axis = axisForCapture(captureType)
    if (axis && pid) {
      try { await recomputeAxisFor(supabase, authData.user.id, pid, axis) } catch { /* best-effort */ }
    }
  }

  // Al VINCULAR una captura de WhatsApp (screenshot) a una MUJER, inferir el
  // ciclo de las menciones ("me vino el 25 de junio"). Reusa el mismo extractor
  // que el import por archivo. chat_inferred + confidence baja, no pisa el dato
  // exacto (ignoreDuplicates). Guardrail de género acá mismo. Best-effort.
  if (hasPersonId && typeof body.person_id === 'string' && body.person_id) {
    try {
      const row = data as Record<string, unknown>
      const captureType = typeof row.capture_type === 'string' ? row.capture_type : ''
      if (captureType.startsWith('whatsapp')) {
        const { data: person } = await supabase
          .from('people').select('gender').eq('user_id', authData.user.id).eq('id', body.person_id).single()
        if ((person as { gender?: string } | null)?.gender === 'female') {
          const today = new Date().toISOString().slice(0, 10)
          const inferred = inferCyclesFromWhatsappData(row.data, today).slice(0, 20)
          for (const c of inferred) {
            await supabase.from('person_cycles').upsert({
              user_id: authData.user.id, person_id: body.person_id,
              date: c.date, phase: c.phase, confidence: 'low', source: 'chat_inferred',
              note: `Inferido de captura: «${c.matched}»`,
            }, { onConflict: 'user_id,person_id,date', ignoreDuplicates: true })
          }
        }
      }
    } catch { /* best-effort: la vinculación no depende de la inferencia */ }
  }

  const observation = toObservation(data as Record<string, unknown>)
  return NextResponse.json({ observation }, { status: 200 })
}
