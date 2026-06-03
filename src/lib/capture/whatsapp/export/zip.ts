// SIR V2 — Extracción de `_chat.txt` del .zip (SOLO SERVER, node:zlib).
//
// Fallback server-side del extractor de zip. El camino primario es client-side
// (unzipClient.ts, con DecompressionStream) para NO subir los archivos de media
// al server (un zip con media supera el límite de body). Este endpoint cubre
// browsers sin DecompressionStream('deflate-raw') y zips chicos. Reusa el
// parser puro de zipCore.ts; acá solo aporta el inflate de Node.

import { inflateRawSync } from 'node:zlib'

import {
  ZipExtractError,
  readCentralDirectory,
  locateChatEntry,
  entryCompressedBytes,
  stripBom,
} from './zipCore'

export { ZipExtractError }

/** Extrae el texto de `_chat.txt` desde el buffer de un .zip de WhatsApp. */
export function extractChatTxtFromZip(zip: Uint8Array): string {
  const entries = readCentralDirectory(zip)
  const target = locateChatEntry(entries)
  if (!target) {
    throw new ZipExtractError('El .zip no contiene _chat.txt (ni ningún .txt).')
  }
  const { method, data } = entryCompressedBytes(zip, target)
  let bytes: Buffer
  if (method === 0) {
    bytes = Buffer.from(data)
  } else if (method === 8) {
    bytes = inflateRawSync(data)
  } else {
    throw new ZipExtractError(`Método de compresión no soportado (${method}).`)
  }
  return stripBom(bytes.toString('utf8'))
}
