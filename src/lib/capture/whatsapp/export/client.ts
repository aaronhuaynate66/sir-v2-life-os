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

export type { ApiError }
