// SIR V2 — Extracción de los .json de Apple Health desde un .zip.
//
// Reusa el lector PURO del directorio central del feature de WhatsApp (zipCore):
// parsea las entradas y devuelve sus bytes comprimidos + el método. La INFLACIÓN
// la inyecta el caller (DecompressionStream en el browser, node:zlib en tests),
// igual que el patrón de WhatsApp — así el mismo código sirve en ambos lados y
// es testeable sin DOM ni red.

import {
  ZipExtractError,
  entryCompressedBytes,
  readCentralDirectory,
  stripBom,
  type ZipEntry,
} from '@/lib/capture/whatsapp/export/zipCore'

/** Inflador de deflate-raw, inyectado por el entorno (browser/server/test). */
export type InflateRaw = (data: Uint8Array) => Uint8Array | Promise<Uint8Array>

/** Entradas .json reales (ignora basura __MACOSX y AppleDouble "._*"). */
export function locateJsonEntries(entries: ZipEntry[]): ZipEntry[] {
  return entries.filter((e) => {
    const lower = e.fileName.toLowerCase()
    if (!lower.endsWith('.json')) return false
    if (lower.startsWith('__macosx')) return false
    const base = lower.split('/').pop() ?? lower
    if (base.startsWith('._')) return false
    return true
  })
}

/**
 * Extrae el texto de TODOS los .json de un .zip de Apple Health. `inflateRaw`
 * descomprime las entradas deflate (método 8); las almacenadas (método 0) se
 * leen directo. Lanza ZipExtractError si el zip es inválido o no tiene .json.
 */
export async function extractJsonTextsFromZip(
  bytes: Uint8Array,
  inflateRaw: InflateRaw,
): Promise<string[]> {
  const entries = readCentralDirectory(bytes)
  const jsons = locateJsonEntries(entries)
  if (jsons.length === 0) {
    throw new ZipExtractError('El .zip no contiene ningún archivo .json de Apple Health.')
  }
  const out: string[] = []
  for (const entry of jsons) {
    const { method, data } = entryCompressedBytes(bytes, entry)
    let raw: Uint8Array
    if (method === 0) {
      raw = data
    } else if (method === 8) {
      raw = await inflateRaw(data)
    } else {
      throw new ZipExtractError(`Método de compresión no soportado (${method}).`)
    }
    out.push(stripBom(new TextDecoder('utf-8').decode(raw)))
  }
  return out
}

export { ZipExtractError }
