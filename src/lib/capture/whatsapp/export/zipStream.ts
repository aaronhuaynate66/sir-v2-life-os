// SIR V2 — Lector de ZIP por STREAMING (client). Lee SOLO lo necesario con
// Blob.slice (directorio central al final + los archivos pedidos por su offset),
// sin cargar el zip entero a memoria. Esto permite procesar exports de WhatsApp
// "con multimedia" de varios GB sin que la pestaña reviente (OOM).
//
// Reusa el shape ZipEntry de zipCore. Cubre el zip clásico (no ZIP64).
'use client'
import { ZipExtractError, type ZipEntry } from './zipCore'

const EOCD_SIG = 0x06054b50
const CDFH_SIG = 0x02014b50
const utf8 = new TextDecoder('utf-8')

async function sliceBytes(file: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(start, end).arrayBuffer())
}

/** Directorio central (streaming) → lista de entradas con offset absoluto. */
export async function readCentralDirectoryStream(file: Blob): Promise<ZipEntry[]> {
  const size = file.size
  const tailLen = Math.min(size, 22 + 0xffff + 64)
  const tail = await sliceBytes(file, size - tailLen, size)
  const tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength)
  let eocd = -1
  for (let i = tail.length - 22; i >= 0; i--) { if (tv.getUint32(i, true) === EOCD_SIG) { eocd = i; break } }
  if (eocd < 0) throw new ZipExtractError('No es un .zip válido (sin EOCD).')
  if (tv.getUint32(eocd + 16, true) === 0xffffffff || tv.getUint16(eocd + 10, true) === 0xffff) throw new ZipExtractError('ZIP64 no soportado.')
  const cdOffset = tv.getUint32(eocd + 16, true)
  const cdSize = tv.getUint32(eocd + 12, true)
  const entryCount = tv.getUint16(eocd + 10, true)

  const cd = await sliceBytes(file, cdOffset, cdOffset + cdSize)
  const view = new DataView(cd.buffer, cd.byteOffset, cd.byteLength)
  const entries: ZipEntry[] = []
  let p = 0
  for (let i = 0; i < entryCount; i++) {
    if (p + 46 > cd.length || view.getUint32(p, true) !== CDFH_SIG) break
    const method = view.getUint16(p + 10, true)
    const compressedSize = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const localHeaderOffset = view.getUint32(p + 42, true)
    const fileName = utf8.decode(cd.subarray(p + 46, p + 46 + nameLen))
    entries.push({ fileName, method, compressedSize, localHeaderOffset })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
  const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(ds)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Bytes DESCOMPRIMIDOS de una entrada, leyendo solo su rango del Blob. */
export async function readEntryStream(file: Blob, entry: ZipEntry): Promise<Uint8Array | null> {
  // Local header: 30 bytes fijos + nombre + extra (los tamaños del LH pueden
  // ser 0 con data-descriptor; usamos compressedSize del directorio central).
  const lh = await sliceBytes(file, entry.localHeaderOffset, entry.localHeaderOffset + 30)
  const lv = new DataView(lh.buffer, lh.byteOffset, lh.byteLength)
  const nameLen = lv.getUint16(26, true)
  const extraLen = lv.getUint16(28, true)
  const dataStart = entry.localHeaderOffset + 30 + nameLen + extraLen
  const comp = await sliceBytes(file, dataStart, dataStart + entry.compressedSize)
  if (entry.method === 0) return comp
  if (entry.method === 8) { try { return await inflateRaw(comp) } catch { return null } }
  return null
}

/** Texto de la entrada _chat.txt (streaming). */
export async function readChatTextStream(file: Blob): Promise<string | null> {
  const entries = await readCentralDirectoryStream(file)
  const lower = (s: string) => s.toLowerCase()
  const chat = entries.find((e) => lower(e.fileName) === '_chat.txt')
    ?? entries.find((e) => lower(e.fileName).endsWith('/_chat.txt'))
    ?? entries.find((e) => lower(e.fileName).endsWith('_chat.txt'))
    ?? entries.find((e) => lower(e.fileName).endsWith('.txt') && !lower(e.fileName).startsWith('__macosx'))
  if (!chat) return null
  const data = await readEntryStream(file, chat)
  if (!data) return null
  const t = utf8.decode(data)
  return t.charCodeAt(0) === 0xfeff ? t.slice(1) : t
}

/** Extrae a Blobs las entradas que matcheen (streaming, una por una). */
export async function extractMatchingBlobs(
  file: Blob, isMatch: (name: string) => boolean, mimeFor: (name: string) => string,
): Promise<Map<string, Blob>> {
  const out = new Map<string, Blob>()
  let entries: ZipEntry[]
  try { entries = await readCentralDirectoryStream(file) } catch { return out }
  for (const e of entries) {
    if (!isMatch(e.fileName)) continue
    const data = await readEntryStream(file, e)
    if (!data) continue
    const base = e.fileName.split('/').pop() || e.fileName
    out.set(base, new Blob([new Uint8Array(data)], { type: mimeFor(base) }))
  }
  return out
}
