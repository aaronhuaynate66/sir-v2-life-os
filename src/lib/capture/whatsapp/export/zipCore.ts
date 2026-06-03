// SIR V2 — Núcleo PURO del lector de ZIP (sin node:zlib ni DOM).
//
// Parsea el DIRECTORIO CENTRAL de un .zip (fuente confiable de tamaños/offsets)
// y ubica la entrada `_chat.txt` del export de WhatsApp, devolviendo sus bytes
// comprimidos + el método de compresión. La DESCOMPRESIÓN la hace el caller con
// el inflate de su entorno (node:zlib en server, DecompressionStream en
// browser), porque difieren. Así el mismo parser sirve para ambos lados y es
// testeable sin red ni dependencias.
//
// Opera sobre Uint8Array + DataView (little-endian), portable browser/server.
// Cubre el zip clásico de WhatsApp (sin ZIP64).

const EOCD_SIG = 0x06054b50
const CDFH_SIG = 0x02014b50
const LFH_SIG = 0x04034b50

export class ZipExtractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ZipExtractError'
  }
}

export interface ZipEntry {
  fileName: string
  /** 0 = stored (sin compresión), 8 = deflate. */
  method: number
  compressedSize: number
  localHeaderOffset: number
}

const utf8 = new TextDecoder('utf-8')

function findEOCD(view: DataView, len: number): number {
  const minPos = Math.max(0, len - (22 + 0xffff))
  for (let i = len - 22; i >= minPos; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) return i
  }
  return -1
}

/** Lee el directorio central → entradas. Lanza si no es un zip válido. */
export function readCentralDirectory(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const eocd = findEOCD(view, bytes.length)
  if (eocd < 0) throw new ZipExtractError('No es un .zip válido (sin EOCD).')

  const cdOffset = view.getUint32(eocd + 16, true)
  const entryCount = view.getUint16(eocd + 10, true)
  const entries: ZipEntry[] = []

  let p = cdOffset
  for (let i = 0; i < entryCount; i++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== CDFH_SIG) break
    const method = view.getUint16(p + 10, true)
    const compressedSize = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const localHeaderOffset = view.getUint32(p + 42, true)
    const fileName = utf8.decode(bytes.subarray(p + 46, p + 46 + nameLen))
    entries.push({ fileName, method, compressedSize, localHeaderOffset })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

/**
 * Elige la entrada del chat: `_chat.txt` exacto, luego cualquiera que termine
 * en `_chat.txt`, y como fallback el primer `.txt` (ignorando basura __MACOSX).
 * null si no hay ningún texto.
 */
export function locateChatEntry(entries: ZipEntry[]): ZipEntry | null {
  const lower = (s: string) => s.toLowerCase()
  return (
    entries.find((e) => lower(e.fileName) === '_chat.txt') ??
    entries.find((e) => lower(e.fileName).endsWith('/_chat.txt')) ??
    entries.find((e) => lower(e.fileName).endsWith('_chat.txt')) ??
    entries.find(
      (e) => lower(e.fileName).endsWith('.txt') && !lower(e.fileName).startsWith('__macosx'),
    ) ??
    null
  )
}

/** Devuelve los bytes COMPRIMIDOS de una entrada (sin descomprimir) + método. */
export function entryCompressedBytes(
  bytes: Uint8Array,
  entry: ZipEntry,
): { method: number; data: Uint8Array } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const lh = entry.localHeaderOffset
  if (lh + 30 > bytes.length || view.getUint32(lh, true) !== LFH_SIG) {
    throw new ZipExtractError('Local header inválido para la entrada del chat.')
  }
  const nameLen = view.getUint16(lh + 26, true)
  const extraLen = view.getUint16(lh + 28, true)
  const dataStart = lh + 30 + nameLen + extraLen
  const dataEnd = dataStart + entry.compressedSize
  return { method: entry.method, data: bytes.subarray(dataStart, dataEnd) }
}

/** Quita el BOM UTF-8 si está presente. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}
