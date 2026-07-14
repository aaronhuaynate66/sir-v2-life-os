// SIR V2 — POST /api/ingest/document
//
// Ingestión documental: subir un documento (PDF de informe/artículo/journal, o
// texto pegado) → estructurarlo con Sonnet → memorias en `memories`, con
// preview/edición ANTES de guardar (nunca guardado ciego, docs/08 #7).
//
// El TEXTO se extrae en el cliente (pdfjs client-side, ver lib/capture/pdf/
// pdfToText). Este endpoint recibe el texto ya extraído — no toca el PDF.
//
// Dos modos (campo `mode`):
//   - 'preview' : { text, filename?, pagesRead?, totalPages? }
//                 → LLM estructura → devuelve DocumentIngestPreview (nada se
//                   persiste). Honesto: legible=false si el texto es ruido/scan.
//   - 'confirm' : { docHash, title, memories, person_id? }
//                 → inserta las memorias YA REVISADAS (upsert idempotente por
//                   id derivado de docHash+índice). Sin LLM (barato).
//
// Auth: sesión activa. Rate limit: bucket 'generation' (es un completion, no
// Visión). Mono-usuario: RLS + user_id explícito.

import { NextResponse, type NextRequest } from 'next/server'

import { complete, LlmError, type CompleteOpts } from '@/lib/llm'
import { createClient } from '@/lib/supabase/server'
import { enforceRateLimit } from '@/lib/ratelimit'
import { reportApiError } from '@/lib/observability/reportApiError'
import {
  DOCUMENT_INGEST_SYSTEM_PROMPT,
  buildDocumentInput,
  parseDocumentResponse,
} from '@/lib/ingest/document/prompt'
import {
  buildDocumentMemoryRows,
  documentTextHash,
  sanitizeProposals,
} from '@/lib/ingest/document/memoryRow'
import type { DocumentIngestPreview, DocumentIngestResult } from '@/lib/ingest/document/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MIN_TEXT_CHARS = 40
const MAX_TEXT_CHARS = 200_000

interface ErrorBody {
  error: string
  detail?: string
}

function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

async function callDocumentLlm(
  userInput: string,
  extra: string,
  ctx: CompleteOpts,
): Promise<string> {
  const system = extra ? `${DOCUMENT_INGEST_SYSTEM_PROMPT}\n\n${extra}` : DOCUMENT_INGEST_SYSTEM_PROMPT
  const res = await complete({
    task: 'extract',
    sensitivity: 'third_party',
    system,
    messages: [{ role: 'user', content: userInput }],
    maxTokens: 3000,
  }, ctx)
  return res.text
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }
  const userId = authData.user.id

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return errorJson(400, 'Body JSON inválido')
  }

  const mode = body.mode === 'confirm' ? 'confirm' : 'preview'

  // ─── CONFIRM: insertar memorias ya revisadas ──────────────────────
  if (mode === 'confirm') {
    const rl = await enforceRateLimit(supabase, userId, 'generation')
    if (!rl.ok) return rl.response

    const docHash = typeof body.docHash === 'string' ? body.docHash.trim() : ''
    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 160) : 'Documento'
    if (!/^[a-f0-9]{6,32}$/.test(docHash)) {
      return errorJson(400, 'docHash inválido', 'Volvé a generar el preview y reintentá.')
    }
    const personId =
      typeof body.person_id === 'string' && body.person_id.length > 0 ? body.person_id : null

    const proposals = sanitizeProposals(body.memories)
    if (proposals.length === 0) {
      return errorJson(422, 'Sin memorias para guardar', 'Revisá que al menos una tenga contenido.')
    }

    // Si viene person_id, verificar pertenencia (RLS + .eq defensivo).
    if (personId) {
      const { data: personRow, error: pErr } = await supabase
        .from('people')
        .select('id')
        .eq('user_id', userId)
        .eq('id', personId)
        .maybeSingle()
      if (pErr) return errorJson(500, 'No se pudo verificar la persona', pErr.message)
      if (!personRow) return errorJson(404, 'Persona no encontrada o sin permiso')
    }

    const occurredAt = new Date().toISOString()
    const rows = buildDocumentMemoryRows(proposals, {
      userId,
      docHash,
      personId,
      occurredAt,
      docTitle: title,
    })

    const { data: inserted, error: upErr } = await supabase
      .from('memories')
      .upsert(rows, { onConflict: 'id', ignoreDuplicates: true })
      .select('id')
    if (upErr) {
      reportApiError(upErr)
      return errorJson(500, 'No se pudieron guardar las memorias', upErr.message)
    }

    const insertedCount = inserted?.length ?? 0
    const result: DocumentIngestResult = {
      saved: true,
      inserted: insertedCount,
      skipped: rows.length - insertedCount,
      personId,
    }
    return NextResponse.json(result, { status: 200 })
  }

  // ─── PREVIEW: estructurar el texto con el LLM ─────────────────────
  const rl = await enforceRateLimit(supabase, userId, 'generation')
  if (!rl.ok) return rl.response

  const text = typeof body.text === 'string' ? body.text : ''
  const filename = typeof body.filename === 'string' ? body.filename.slice(0, 200) : ''
  const pagesRead = typeof body.pagesRead === 'number' ? body.pagesRead : undefined
  const totalPages = typeof body.totalPages === 'number' ? body.totalPages : undefined

  const trimmed = text.trim()
  if (trimmed.length < MIN_TEXT_CHARS) {
    return errorJson(
      422,
      'El documento no tiene texto legible',
      'Puede ser un PDF escaneado (sólo imágenes). Para esos, subilo como imagen desde /captura (Visión). Para un PDF con texto real, reintentá.',
    )
  }
  if (text.length > MAX_TEXT_CHARS) {
    return errorJson(413, 'Documento demasiado largo', `Máx ${MAX_TEXT_CHARS} caracteres.`)
  }

  const input = buildDocumentInput(filename, trimmed, { pagesRead, totalPages })
  const llmCtx: CompleteOpts = { supabase, userId }

  let parsed = null
  try {
    const raw = await callDocumentLlm(input, '', llmCtx)
    parsed = parseDocumentResponse(raw)
    if (!parsed) {
      const raw2 = await callDocumentLlm(
        input,
        'CRÍTICO: tu respuesta anterior no era JSON válido. Devolvé SOLO el JSON del schema, sin texto adicional, sin markdown fences. Empezá con `{` y terminá con `}`.',
        llmCtx,
      )
      parsed = parseDocumentResponse(raw2)
    }
  } catch (e) {
    reportApiError(e)
    if (e instanceof LlmError && e.code === 'no_provider') {
      return errorJson(500, 'No hay proveedor LLM configurado en el server')
    }
    const msg = e instanceof Error ? e.message : String(e)
    return errorJson(502, 'Falló la síntesis del documento', msg.slice(0, 300))
  }

  if (!parsed) {
    return errorJson(502, 'El modelo devolvió un formato inválido', 'Reintentá en un momento.')
  }

  const preview: DocumentIngestPreview = {
    preview: true,
    docHash: documentTextHash(trimmed),
    title: parsed.title,
    docKind: parsed.docKind,
    legible: parsed.legible,
    summary: parsed.summary,
    memories: parsed.memories,
    meta: { chars: trimmed.length, pagesRead, totalPages },
  }
  return NextResponse.json(preview, { status: 200 })
}
