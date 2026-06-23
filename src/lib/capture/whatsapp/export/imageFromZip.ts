// SIR V2 — Extrae los archivos de IMAGEN (fotos) de un .zip de export de
// WhatsApp, client-side. Mismo patrón que audioFromZip. Excluye stickers (.webp).
'use client'
import { readCentralDirectory, entryCompressedBytes } from './zipCore'
import { supportsClientUnzip } from './unzipClient'
import { isImageFileName } from './imageTriage'

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
  const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(ds)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}
function mimeForName(name: string): string {
  const n = name.toLowerCase()
  if (n.endsWith('.png')) return 'image/png'
  if (n.endsWith('.heic') || n.endsWith('.heif')) return 'image/heic'
  return 'image/jpeg'
}

export async function extractImageBlobs(file: Blob): Promise<Map<string, Blob>> {
  const out = new Map<string, Blob>()
  let bytes: Uint8Array
  try { bytes = new Uint8Array(await file.arrayBuffer()) } catch { return out }
  let entries
  try { entries = readCentralDirectory(bytes) } catch { return out }
  for (const e of entries) {
    if (!isImageFileName(e.fileName)) continue
    let data: Uint8Array
    try {
      const got = entryCompressedBytes(bytes, e)
      if (got.method === 0) data = got.data
      else if (got.method === 8) { if (!supportsClientUnzip()) continue; data = await inflateRaw(got.data) }
      else continue
    } catch { continue }
    const base = e.fileName.split('/').pop() || e.fileName
    out.set(base, new Blob([new Uint8Array(data)], { type: mimeForName(base) }))
  }
  return out
}
