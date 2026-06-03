// SIR V2 — Extracción de `_chat.txt` del .zip EN EL CLIENTE. 'use client'.
//
// Camino PRIMARIO para .zip: extraemos el texto del chat en el browser usando
// DecompressionStream('deflate-raw'), así NUNCA subimos los archivos de media
// (un zip con media supera el límite de body de Vercel). Solo el texto chico
// del chat viaja después, bloque por bloque, al endpoint de interpretación.
//
// Si el browser no soporta DecompressionStream('deflate-raw'), el caller cae al
// endpoint server (/api/capture/whatsapp-export/unzip) que usa node:zlib.

'use client'

import {
  ZipExtractError,
  readCentralDirectory,
  locateChatEntry,
  entryCompressedBytes,
  stripBom,
} from './zipCore'

/** ¿El browser soporta inflar deflate-raw nativamente? */
export function supportsClientUnzip(): boolean {
  return typeof DecompressionStream !== 'undefined'
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  // Copia a un buffer propio (ArrayBuffer concreto) para el tipado de BlobPart.
  const part = new Uint8Array(data)
  const ds = new DecompressionStream('deflate-raw')
  const stream = new Blob([part]).stream().pipeThrough(ds)
  const ab = await new Response(stream).arrayBuffer()
  return new Uint8Array(ab)
}

/**
 * Extrae el texto de `_chat.txt` desde un File/Blob .zip, en el cliente.
 * Lanza ZipExtractError si no hay texto o el método no se soporta.
 */
export async function extractChatTxtFromZipClient(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const entries = readCentralDirectory(bytes)
  const target = locateChatEntry(entries)
  if (!target) {
    throw new ZipExtractError('El .zip no contiene _chat.txt (ni ningún .txt).')
  }
  const { method, data } = entryCompressedBytes(bytes, target)
  let out: Uint8Array
  if (method === 0) {
    out = data
  } else if (method === 8) {
    if (!supportsClientUnzip()) {
      throw new ZipExtractError('DecompressionStream no disponible en este browser.')
    }
    out = await inflateRaw(data)
  } else {
    throw new ZipExtractError(`Método de compresión no soportado (${method}).`)
  }
  return stripBom(new TextDecoder('utf-8').decode(out))
}

export { ZipExtractError }
