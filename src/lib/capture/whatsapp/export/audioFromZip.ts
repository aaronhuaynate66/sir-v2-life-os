// SIR V2 — Extracción de los archivos de AUDIO (notas de voz) de un .zip de
// export de WhatsApp, en el cliente. Reusa el parser de zip (zipCore) +
// DecompressionStream (igual que unzipClient para _chat.txt). Solo audios:
// imágenes/stickers quedan para una fase posterior.
'use client'

import { readCentralDirectory, entryCompressedBytes } from './zipCore'
import { supportsClientUnzip } from './unzipClient'
import { isAudioFileName } from './audioInject'

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const part = new Uint8Array(data)
  const ds = new DecompressionStream('deflate-raw')
  const stream = new Blob([part]).stream().pipeThrough(ds)
  const ab = await new Response(stream).arrayBuffer()
  return new Uint8Array(ab)
}

function mimeForName(name: string): string {
  const n = name.toLowerCase()
  if (n.endsWith('.opus') || n.endsWith('.ogg')) return 'audio/ogg'
  if (n.endsWith('.m4a') || n.endsWith('.mp4')) return 'audio/mp4'
  if (n.endsWith('.mp3')) return 'audio/mpeg'
  if (n.endsWith('.wav')) return 'audio/wav'
  if (n.endsWith('.aac')) return 'audio/aac'
  if (n.endsWith('.amr')) return 'audio/amr'
  return 'application/octet-stream'
}

/** Devuelve un Map nombreBase → Blob de cada audio del zip. Vacío si el zip no
 *  tiene media (export "sin archivos") o el browser no puede inflar. */
export async function extractAudioBlobs(file: Blob): Promise<Map<string, Blob>> {
  const out = new Map<string, Blob>()
  let bytes: Uint8Array
  try { bytes = new Uint8Array(await file.arrayBuffer()) } catch { return out }
  let entries
  try { entries = readCentralDirectory(bytes) } catch { return out }
  for (const e of entries) {
    if (!isAudioFileName(e.fileName)) continue
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
