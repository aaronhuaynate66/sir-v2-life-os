'use client'
// SIR V2 — Extrae los STICKERS (.webp) de un .zip de export de WhatsApp, client-side.
import { readCentralDirectory, entryCompressedBytes } from './zipCore'
import { supportsClientUnzip } from './unzipClient'
import { isStickerFileName } from './stickerTone'

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw')
  const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(ds)
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function extractStickerBlobs(file: Blob): Promise<Map<string, Blob>> {
  const out = new Map<string, Blob>()
  let bytes: Uint8Array
  try { bytes = new Uint8Array(await file.arrayBuffer()) } catch { return out }
  let entries
  try { entries = readCentralDirectory(bytes) } catch { return out }
  for (const e of entries) {
    if (!isStickerFileName(e.fileName)) continue
    let data: Uint8Array
    try {
      const got = entryCompressedBytes(bytes, e)
      if (got.method === 0) data = got.data
      else if (got.method === 8) { if (!supportsClientUnzip()) continue; data = await inflateRaw(got.data) }
      else continue
    } catch { continue }
    const base = e.fileName.split('/').pop() || e.fileName
    out.set(base, new Blob([new Uint8Array(data)], { type: 'image/webp' }))
  }
  return out
}
