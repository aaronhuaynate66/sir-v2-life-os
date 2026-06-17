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
import { randomUUID } from 'node:crypto'
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
  const rt = typeof d.recentTone === 'number' ? Math.max(1, Math.min(5, Math.round(d.recentTone))) : null

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
      ...(rt !== null ? { recentTone: rt } : {}),
      ...(et !== null ? { emotionalTone: et } : {}),
    },
  }
}

interface PostBody {
  person_id?: unknown
  data?: unknown
  promote_dates?: unknown
}

/** Normaliza una etiqueta para deduplicar fechas. */
function normLabel(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

interface SpecialDateRow {
  id: string
  label: string
  date: string
  recurring: boolean
}

/** Promueve extractedDates (del export) a people.special_dates, dedup por
 *  (label normalizado + fecha). RELLENA-SI-FALTA, no pisa. Best-effort. */
async function promoteDatesToSpecialDates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  personId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const extracted = Array.isArray(data.extractedDates) ? (data.extractedDates as Record<string, unknown>[]) : []
  if (extracted.length === 0) return
  const { data: prow } = await supabase
    .from('people')
    .select('special_dates')
    .eq('user_id', userId)
    .eq('id', personId)
    .maybeSingle()
  const existing: SpecialDateRow[] = Array.isArray(prow?.special_dates) ? (prow!.special_dates as SpecialDateRow[]) : []
  const seen = new Set(existing.map((d) => `${normLabel(d.label ?? '')}|${(d.date ?? '').slice(0, 10)}`))
  const additions: SpecialDateRow[] = []
  for (const d of extracted) {
    const label = typeof d.label === 'string' ? d.label.trim().slice(0, 160) : ''
    const iso = typeof d.dateISO === 'string' ? d.dateISO.slice(0, 10) : ''
    if (!label || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue
    const key = `${normLabel(label)}|${iso}`
    if (seen.has(key)) continue
    seen.add(key)
    additions.push({ id: randomUUID(), label, date: iso, recurring: d.recurring === true })
  }
  if (additions.length === 0) return
  await supabase
    .from('people')
    .update({ special_dates: [...existing, ...additions] })
    .eq('user_id', userId)
    .eq('id', personId)
}

/**
 * GET /api/capture/whatsapp-export/state?person_id=...
 * Devuelve hasta qué fecha (ISO) ya se importó WhatsApp de esa persona, para
 * el import INCREMENTAL: el cliente recorta el export a los mensajes
 * posteriores a `lastImportedISO`. Es el MAX(observed_at) de las observaciones
 * whatsapp_chat de la persona (observed_at = último mensaje del export). RLS
 * + ownership. Sin observaciones previas → null (primer import).
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }
  const userId = authData.user.id

  const personId = req.nextUrl.searchParams.get('person_id')
  if (!personId) {
    return errorJson(400, 'person_id requerido')
  }

  const { data: rows, error } = await supabase
    .from('observations')
    .select('observed_at')
    .eq('user_id', userId)
    .eq('person_id', personId)
    .eq('capture_type', 'whatsapp_chat')
    .order('observed_at', { ascending: false })
    .limit(1)
  if (error) {
    return errorJson(500, 'No se pudo leer el estado de import', error.message)
  }
  const lastImportedISO =
    rows && rows.length > 0 && typeof rows[0].observed_at === 'string' ? rows[0].observed_at : null
  return NextResponse.json({ lastImportedISO })
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
  data.importedAt = new Date().toISOString()

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

    // AUTO-TONO del import → Reciprocidad. El extractor ya calcula el tono de la
    // conversación (interactionQuality 1-5; una pelea = 1-2). Sin esto el import
    // NO movía el score aunque la IA detectara el conflicto. Escribimos UNA
    // interacción person_logs con ese tono → baja/sube la Reciprocidad sola.
    // Guarda anti-doble-conteo: no duplica si ya hay una interacción ese día
    // (re-import del mismo chat, o tono cargado a mano).
    try {
      // El score (Reciprocidad) debe reflejar "¿cómo estamos AHORA?": usamos el
      // TONO RECIENTE (mínimo de la ventana nueva), no el promedio histórico que
      // ahogaría una pelea reciente entre años de charla cordial. Fallback al
      // promedio si no vino el reciente (imports viejos).
      const recent = typeof (data as { recentTone?: unknown }).recentTone === 'number'
        ? Math.max(1, Math.min(5, Math.round((data as { recentTone: number }).recentTone)))
        : null
      const avg = typeof (data as { interactionQuality?: unknown }).interactionQuality === 'number'
        ? Math.max(1, Math.min(5, Math.round((data as { interactionQuality: number }).interactionQuality)))
        : null
      const iq = recent ?? avg
      const day = (observedAt || '').slice(0, 10)
      if (iq !== null && day) {
        const { data: existing } = await supabase
          .from('person_logs')
          .select('id')
          .eq('user_id', userId)
          .eq('person_id', personId)
          .eq('kind', 'interaction')
          .gte('logged_at', `${day}T00:00:00.000Z`)
          .lte('logged_at', `${day}T23:59:59.999Z`)
          .limit(1)
        if (!existing || existing.length === 0) {
          const summary = typeof (data as { summary?: unknown }).summary === 'string' ? (data as { summary: string }).summary : ''
          const tense = iq <= 2
          const prefix = tense ? 'Conversación reciente TENSA' : 'Tono inferido del chat importado'
          await supabase.from('person_logs').insert({
            user_id: userId,
            person_id: personId,
            kind: 'interaction',
            value: iq,
            note: `${prefix}${summary ? ` — ${summary.slice(0, 160)}` : ''}`,
            logged_at: `${day}T12:00:00.000Z`,
          })
        }
      }
    } catch {
      /* best-effort: el tono no debe romper el import */
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

    // Promoción de fechas → "Fechas importantes" (solo si el cliente lo pide;
    // el intake lo activa para que las fechas crucen al perfil sin paso manual).
    if (body.promote_dates === true) {
      try {
        await promoteDatesToSpecialDates(supabase, userId, personId, data)
      } catch {
        /* no fatal: la observación ya quedó guardada */
      }
    }

    return NextResponse.json({ observation }, { status: 200 })
  } catch (e) {
    reportApiError(e)
    const msg = e instanceof Error ? e.message : String(e)
    return errorJson(500, 'No se pudo guardar la conversación', msg.slice(0, 300))
  }
}
