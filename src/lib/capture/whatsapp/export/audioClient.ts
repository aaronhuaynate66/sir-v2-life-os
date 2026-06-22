// SIR V2 — Orquestador (cliente): transcribe las notas de voz de un export de
// WhatsApp y las inyecta en el texto del chat. Acota a los `cap` audios más
// recientes (control de costo). Best-effort: si un audio falla, se omite.
'use client'

import { extractAudioBlobs } from './audioFromZip'
import { pickRecentAudioRefs, injectAudioTranscripts } from './audioInject'

export interface TranscribeExportAudiosResult {
  text: string
  transcribed: number
  found: number
}

export async function transcribeExportAudios(
  file: Blob,
  text: string,
  opts: { cap?: number; sinceISO?: string | null; onProgress?: (done: number, total: number) => void } = {},
): Promise<TranscribeExportAudiosResult> {
  const cap = opts.cap ?? 25
  let blobs: Map<string, Blob>
  try { blobs = await extractAudioBlobs(file) } catch { return { text, transcribed: 0, found: 0 } }
  if (blobs.size === 0) return { text, transcribed: 0, found: 0 }
  const names = pickRecentAudioRefs(text, blobs.keys(), cap, opts.sinceISO ?? null)
  if (names.length === 0) return { text, transcribed: 0, found: blobs.size }

  const map = new Map<string, string>()
  let done = 0
  opts.onProgress?.(0, names.length)
  for (const name of names) {
    const blob = blobs.get(name)
    if (blob) {
      try {
        const fd = new FormData()
        fd.append('file', blob, name)
        const res = await fetch('/api/transcribe/audio', { method: 'POST', body: fd })
        if (res.ok) {
          const j = (await res.json()) as { text?: string }
          if (j.text) map.set(name, j.text)
        }
      } catch { /* omitir este audio */ }
    }
    done++
    opts.onProgress?.(done, names.length)
  }
  return { text: injectAudioTranscripts(text, map), transcribed: map.size, found: blobs.size }
}
