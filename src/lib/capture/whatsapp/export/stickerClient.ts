'use client'
import { extractStickerBlobs } from './stickerFromZip'
import { pickRecentStickerRefs, injectStickerTones } from './stickerTone'

export interface StickerToneResult { text: string; tagged: number }

export async function tagExportStickers(
  file: Blob, text: string,
  opts: { cap?: number; sinceISO?: string | null; onProgress?: (done: number, total: number) => void } = {},
): Promise<StickerToneResult> {
  const cap = opts.cap ?? 20
  let blobs: Map<string, Blob>
  try { blobs = await extractStickerBlobs(file) } catch { return { text, tagged: 0 } }
  if (blobs.size === 0) return { text, tagged: 0 }
  const names = pickRecentStickerRefs(text, blobs.keys(), cap, opts.sinceISO ?? null)
  if (names.length === 0) return { text, tagged: 0 }
  const map = new Map<string, string>()
  let done = 0; opts.onProgress?.(0, names.length)
  for (const name of names) {
    const blob = blobs.get(name)
    if (blob) {
      try {
        const fd = new FormData(); fd.append('file', blob, name)
        const res = await fetch('/api/capture/whatsapp-export/sticker-tone', { method: 'POST', body: fd })
        if (res.ok) { const j = (await res.json()) as { tone?: string }; if (j.tone) map.set(name, j.tone) }
      } catch { /* omitir */ }
    }
    done++; opts.onProgress?.(done, names.length)
  }
  return { text: injectStickerTones(text, map), tagged: map.size }
}
