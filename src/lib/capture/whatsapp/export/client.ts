// SIR V2 — Cliente del flujo "subir export de WhatsApp" (browser).
//
// Helpers de red para el panel de captura:
//   - readExportText(file)  : .txt → texto directo; .zip → extracción client-side
//                             (sin subir media), con fallback al endpoint server.
//   - interpretChunk(...)    : POST de UN bloque → ChunkInterpretation.
//   - persistWhatsAppExport  : POST del `data` consolidado → observación whatsapp_chat.
//
// El orquestador (parse → chunk → pool(interpret) → consolidate) vive en el
// componente, igual que el flujo multi-imagen.

'use client'

import { parseErrorResponse, type ApiError } from '@/lib/api/errors'
import type { Observation } from '@/lib/capture/observations/types'
import type { ChunkInterpretation } from './types'
import { extractChatTxtFromZipClient, supportsClientUnzip } from './unzipClient'

/** ¿El nombre del archivo parece un .zip? */
function isZipName(name: string): boolean {
  return /\.zip$/i.test(name)
}

/**
 * Obtiene el texto del `_chat.txt`:
 *   - .txt → lo lee directo (no toca el server).
 *   - .zip → lo extrae en el cliente (DecompressionStream). Si el browser no
 *     soporta deflate-raw, sube el .zip al endpoint server como fallback.
 */
export async function readExportText(file: File): Promise<string> {
  if (isZipName(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
    if (supportsClientUnzip()) {
      try {
        return await extractChatTxtFromZipClient(file)
      } catch {
        // Fallback server (zips chicos / método raro). Si también falla, propaga.
        return await unzipOnServer(file)
      }
    }
    return await unzipOnServer(file)
  }
  // .txt (o cualquier texto): leer directo.
  return await file.text()
}

async function unzipOnServer(file: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', file, file.name || 'export.zip')
  const res = await fetch('/api/capture/whatsapp-export/unzip', { method: 'POST', body: fd })
  if (!res.ok) throw await parseErrorResponse(res)
  const json = (await res.json()) as { text: string }
  return json.text
}

export interface InterpretChunkInput {
  chunkText: string
  personName: string
  index: number
  total: number
}

/** Interpreta UN bloque vía el endpoint server. */
export async function interpretChunk(
  input: InterpretChunkInput,
  signal?: AbortSignal,
): Promise<ChunkInterpretation> {
  const res = await fetch('/api/capture/whatsapp-export/interpret', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chunk_text: input.chunkText,
      person_name: input.personName,
      index: input.index,
      total: input.total,
    }),
    signal,
  })
  if (!res.ok) throw await parseErrorResponse(res)
  const json = (await res.json()) as { interpretation: ChunkInterpretation }
  return json.interpretation
}

export interface PersistWhatsAppExportInput {
  personId: string
  data: Record<string, unknown>
  /** Si true, el server promueve las fechas extraídas a special_dates. */
  promoteDates?: boolean
}

/** Persiste el `data` consolidado como UNA observación whatsapp_chat. */
export async function persistWhatsAppExport(
  input: PersistWhatsAppExportInput,
): Promise<Observation> {
  const res = await fetch('/api/capture/whatsapp-export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ person_id: input.personId, data: input.data, promote_dates: input.promoteDates === true }),
  })
  if (!res.ok) throw await parseErrorResponse(res)
  const json = (await res.json()) as { observation: Observation }
  return json.observation
}

/** Lee hasta qué fecha (ISO) ya se importó WhatsApp de esta persona, para el
 *  import incremental. null = primer import (o sin red → tratamos como primer
 *  import: el server igual deduplica por día en el auto-tono). */
export async function getLastImportedISO(personId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `/api/capture/whatsapp-export/state?person_id=${encodeURIComponent(personId)}`,
    )
    if (!res.ok) return null
    const json = (await res.json()) as { lastImportedISO?: string | null }
    return typeof json.lastImportedISO === 'string' ? json.lastImportedISO : null
  } catch {
    return null
  }
}

/** Archiva el TEXTO CRUDO del export para "registro completo" + búsqueda
 *  (bitácora). Capa el tramo más reciente (~3MB) para no pegar contra el límite
 *  de body. Best-effort: no debe romper el guardado de la observación. */
export async function archiveConversation(input: {
  personId: string
  rawText: string
  dateFirst?: string | null
  dateLast?: string | null
  messageCount?: number
  source?: string
}): Promise<void> {
  try {
    const MAX = 3_000_000
    let raw = input.rawText || ''
    if (raw.length > MAX) {
      const s = raw.slice(raw.length - MAX)
      const nl = s.indexOf('\n')
      raw = nl > 0 ? s.slice(nl + 1) : s
    }
    if (!raw) return
    await fetch('/api/conversation-archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personId: input.personId, rawText: raw,
        dateFirst: input.dateFirst ?? null, dateLast: input.dateLast ?? null,
        messageCount: input.messageCount, source: input.source ?? 'whatsapp',
      }),
    })
  } catch { /* best-effort */ }
}

export type { ApiError }
