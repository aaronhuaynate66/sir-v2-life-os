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

import { ZipExtractError } from './zipCore'
import { readChatTextStream } from './zipStream'

/** ¿El browser soporta inflar deflate-raw nativamente? */
export function supportsClientUnzip(): boolean {
  return typeof DecompressionStream !== 'undefined'
}

/**
 * Extrae el texto de `_chat.txt` desde un File/Blob .zip, en el cliente.
 * Lanza ZipExtractError si no hay texto o el método no se soporta.
 */
export async function extractChatTxtFromZipClient(file: Blob): Promise<string> {
  // STREAMING (Blob.slice): lee solo el directorio + el _chat.txt, sin cargar
  // el zip entero a memoria → soporta exports con multimedia de varios GB.
  if (!supportsClientUnzip()) {
    throw new ZipExtractError('DecompressionStream no disponible en este browser.')
  }
  const text = await readChatTextStream(file)
  if (text == null) {
    throw new ZipExtractError('El .zip no contiene _chat.txt (ni ningún .txt).')
  }
  return text
}

export { ZipExtractError }
