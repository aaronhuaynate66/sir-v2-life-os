'use client'
// SIR V2 — Orquesta el TRIAGE de imágenes del export: extrae las fotos del .zip,
// elige las recientes-y-nuevas (sinceISO), las clasifica (visión) e inyecta la
// DATA de las útiles (documentos/capturas) en el texto. Las personales se omiten.
import { extractImageBlobs } from './imageFromZip'
import { pickRecentImageRefs, injectImageTexts } from './imageTriage'

export interface TriageImagesResult { text: string; kept: number; scanned: number }

export async function triageExportImages(
  file: Blob,
  text: string,
  opts: { cap?: number; sinceISO?: string | null; onProgress?: (done: number, total: number) => void } = {},
): Promise<TriageImagesResult> {
  const cap = opts.cap ?? 15
  let blobs: Map<string, Blob>
  try { blobs = await extractImageBlobs(file) } catch { return { text, kept: 0, scanned: 0 } }
  if (blobs.size === 0) return { text, kept: 0, scanned: 0 }
  const names = pickRecentImageRefs(text, blobs.keys(), cap, opts.sinceISO ?? null)
  if (names.length === 0) return { text, kept: 0, scanned: 0 }
  const map = new Map<string, string>()
  let done = 0
  opts.onProgress?.(0, names.length)
  for (const name of names) {
    const blob = blobs.get(name)
    if (blob) {
      try {
        const fd = new FormData(); fd.append('file', blob, name)
        const res = await fetch('/api/capture/whatsapp-export/image-triage', { method: 'POST', body: fd })
        if (res.ok) { const j = (await res.json()) as { keep?: boolean; text?: string }; if (j.keep && j.text) map.set(name, j.text) }
      } catch { /* omitir */ }
    }
    done++; opts.onProgress?.(done, names.length)
  }
  return { text: injectImageTexts(text, map), kept: map.size, scanned: names.length }
}
