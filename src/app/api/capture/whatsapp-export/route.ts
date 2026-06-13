// SIR V2 — POST /api/capture/whatsapp-export
//
// Persiste el `data` ya consolidado (y revisado por el usuario) como UNA
// observación whatsapp_chat asociada a la persona. NO llama al LLM: la
// interpretación ya ocurrió bloque a bloque vía /interpret. Esta observación
// alimenta lo mismo que una captura WhatsApp normal: "Lo personal"
// (person-synthesis lee summary/topics/emotionalStates), recencia/Fuerza
// (conversationDate → observed_at), memorias (deriveFromObservations) y bitácora.
//
// Body JSON: { person_id, data }  (data lo arma el cliente con
// buildExportObservationData — acá se sanea defensivamente).
//
// Auth + ownership de la persona requeridos. RLS asegura que la observación
// queda en el SIR del usuario.

import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { insertObservation } from '@/lib/capture/observations/insert'
import { deriveObservedAt } from '@/lib/capture/observations/observed-at'
import { recentWindowContent, recentWindowMemoryRow } from '@/lib/memories/recentWindow'
import type { Confidence } from '@/lib/capture/observations/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

interface ErrorBody {
  error: string
  detail?: string
}

function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim().slice(0, max) : null
}

function strArray(v: unknown, cap: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .slice(0, cap)
    .map((x) => x.trim().slice(0, maxLen))
}

/** Sanea defensivamente el `data` recibido del cliente → shape whatsapp_chat
 *  + extras del export, con todos los tamaños acotados. */
function sanitizeData(raw: unknown): { data: Record<string, unknown>; confidence: Confidence } {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  const conf = d.confidence
  const confidence: Confidence = conf === 'high' || conf === 'medium' || conf === 'low' ? conf : 'high'

  const emo = (d.emotionalStates && typeof d.emotionalStates === 'object'
    ? d.emotionalStates
    : {}) as Record<string, unknown>

  // rawMessages: muestra acotada (evidencia). Validamos shape mínima.
  const rawMessages = Array.isArray(d.rawMessages)
    ? d.rawMessages
        .slice(0, 40)
        .map((m) => {
          const o = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>
          return {
            timestamp: typeof o.timestamp === 'string' ? o.timestamp.slice(0, 5) : '00:00',
            author: o.author === 'user' ? 'user' : 'other',
            content: typeof o.content === 'string' ? o.content.slice(0, 500) : '',
          }
        })
        .filter((m) => m.content.length > 0)
    : []

  const dateRange = (d.dateRange && typeof d.dateRange === 'object'
    ? d.dateRange
    : {}) as Record<string, unknown>

  const extractedDates = Array.isArray(d.extractedDates)
    ? d.extractedDates.slice(0, 30).map((x) => {
        const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
        return {
          label: str(o.label, 120) ?? '',
          dateISO: typeof o.dateISO === 'string' ? o.dateISO.slice(0, 40) : null,
          rawText: str(o.rawText, 240) ?? '',
          recurring: o.recurring === true,
        }
      }).filter((x) => x.label.length > 0)
    : []

  const iq = typeof d.interactionQuality === 'number' ? Math.max(1, Math.min(5, Math.round(d.interactionQuality))) : null
  const et = typeof d.emotionalTone === 'number' ? Math.max(-1, Math.min(1, d.emotionalTone)) : null

  return {
    confidence,
    data: {
      personName: str(d.personName, 120) ?? '',
      conversationDate: typeof d.conversationDate === 'string' ? d.conversationDate : null,
      summary: str(d.summary, 1500) ?? '',
      topics: strArray(d.topics, 20, 40),
      emotionalStates: {
        user: str(emo.user, 80) ?? undefined,
        otherPerson: str(emo.otherPerson, 80) ?? undefined,
      },
      rawMessages,
      confidence,
      rawObservations: str(d.rawObservations, 240) ?? undefined,
      source: 'whatsapp_export',
      messageCount: typeof d.messageCount === 'number' ? d.messageCount : rawMessages.length,
      mediaCount: typeof d.mediaCount === 'number' ? d.mediaCount : 0,
      dateRange: {
        first: typeof dateRange.first === 'string' ? dateRange.first : null,
        last: typeof dateRange.last === 'string' ? dateRange.last : null,
      },
      participants: strArray(d.participants, 12, 80),
      blockSummaries: strArray(d.blockSummaries, 60, 600),
      facts: strArray(d.facts, 30, 240),
      events: strArray(d.events, 20, 200),
      extractedDates,
      ...(iq !== null ? { interactionQuality: iq } : {}),
      ...(et !== null ? { emotionalTone: et } : {}),
    },
  }
}

interface PostBody {
  person_id?: unknown
  data?: unknown
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }
  const userId = authData.user.id

  let body: PostBody
  try {
    body = (await req.json()) as PostBody
  } catch {
    return errorJson(400, 'Body JSON inválido')
  }

  const personId = typeof body.person_id === 'string' && body.person_id.length > 0 ? body.person_id : null
  if (!personId) {
    return errorJson(400, 'person_id requerido')
  }

  // Ownership de la persona (RLS igual lo cubriría; chequeo explícito → 404 claro).
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

  const { data, confidence } = sanitizeData(body.data)
  if (!data.summary && (data.topics as string[]).length === 0) {
    return errorJson(422, 'Sin contenido para guardar', 'La conversación no produjo resumen ni temas.')
  }

  const observedAt = deriveObservedAt('whatsapp_chat', data)

  try {
    const observation = await insertObservation(supabase, {
      userId,
      personId,
      captureType: 'whatsapp_chat',
      sourceImagePath: null,
      storageBucket: null,
      data,
      detectorData: {
        type: 'whatsapp_chat',
        confidence,
        reasoning: 'export de WhatsApp (texto fiel)',
        suggestedPersonName: (data.personName as string) || null,
      },
      confidence,
      observedAt,
      needsReview: false,
    })

    // Sincronizar people.last_contact con el ÚLTIMO mensaje del export. Sin esto
    // el campo queda viejo y el briefing ancla la recencia en una fecha pasada
    // (bug observado: brief de pareja hablaba del "30 de mayo" tras importar
    // junio). Best-effort, y sólo si adelanta la fecha (no pisa una más nueva).
    try {
      const lastDay = (observedAt || '').slice(0, 10)
      if (lastDay) {
        const { data: prow } = await supabase
          .from('people')
          .select('last_contact')
          .eq('user_id', userId)
          .eq('id', personId)
          .maybeSingle()
        const current = (prow?.last_contact as string | null) ?? null
        if (!current || current.slice(0, 10) < lastDay) {
          await supabase
            .from('people')
            .update({ last_contact: lastDay })
            .eq('user_id', userId)
            .eq('id', personId)
        }
      }
    } catch {
      /* no fatal: la observación ya quedó guardada */
    }

    // Memoria de VENTANA RECIENTE: lo más nuevo del chat (últimos bloques) con
    // fecha = último mensaje. Encabeza getMemoriesForPerson (orden por
    // occurred_at DESC) → el briefing lee la textura reciente, no el promedio
    // histórico. Idempotente (id mem_recent:<observationId>). Best-effort.
    try {
      const content = recentWindowContent(
        (data.blockSummaries as string[] | undefined) ?? null,
        (data.summary as string | undefined) ?? null,
      )
      if (content && observation?.id) {
        const row = recentWindowMemoryRow(
          { observationId: observation.id, personId, content, occurredAt: observedAt },
          userId,
        )
        await supabase.from('memories').upsert([row], { onConflict: 'id', ignoreDuplicates: true })
      }
    } catch {
      /* no fatal: la observación ya quedó guardada */
    }

    return NextResponse.json({ observation }, { status: 200 })
  } catch (e) {
    reportApiError(e)
    const msg = e instanceof Error ? e.message : String(e)
    return errorJson(500, 'No se pudo guardar la conversación', msg.slice(0, 300))
  }
}
