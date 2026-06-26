// SIR V2 — Cliente de ingesta de puntos de tracker (browser).
//
// Dos vías:
//   - ingestImages(files, hint, onProgress): MULTI-PANTALLAZO. Comprime y llama
//     /api/trackers/extract UNA vez por imagen, con concurrencia acotada (3),
//     igual que báscula / multi-imagen. Cada imagen → una lectura {value,date}.
//   - ingestText(text, fallbackYear): TEXTO PEGADO. Parser puro, sin Vision.
//
// Devuelven NewPointInput[] (lecturas crudas) que el caller consolida con
// buildPoints (dedup por fecha) antes de persistir.

'use client'

import { blobToBase64, compressForExtraction } from '@/lib/capture/scale/compress'
import { extractValueDateFromText, readingDate } from '@/lib/trackers/parse'
import type { NewPointInput } from '@/lib/trackers/points'
import type { ExtractHint, TrackerExtracted } from './types'

/** Llama al endpoint Vision con una imagen ya comprimida (base64). */
export async function extractTrackerImage(
  imageBlob: Blob,
  hint?: ExtractHint,
  signal?: AbortSignal,
): Promise<TrackerExtracted> {
  const imageBase64 = await blobToBase64(imageBlob)
  const res = await fetch('/api/trackers/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mimeType: imageBlob.type || 'image/webp', hint }),
    signal,
  })
  if (!res.ok) {
    let detail: string | undefined
    try {
      const b = (await res.json()) as { error?: string; detail?: string }
      detail = b.error ?? b.detail
    } catch {
      detail = `HTTP ${res.status}`
    }
    throw new Error(detail ?? `Falló la extracción (${res.status})`)
  }
  return (await res.json()) as TrackerExtracted
}

/** Procesa items con concurrencia acotada (mismo patrón que AgregarCapturaPanel). */
async function runPool<T>(items: T[], limit: number, worker: (item: T, i: number) => Promise<void>): Promise<void> {
  let next = 0
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      await worker(items[i], i)
    }
  })
  await Promise.all(lanes)
}

export interface ImageIngestResult {
  /** Lecturas válidas (con valor) listas para consolidar en puntos. */
  readings: NewPointInput[]
  /** Imágenes que no aportaron un valor legible (para feedback al usuario). */
  skipped: number
  /** Detalle de la extracción por imagen (para mostrar en la revisión). */
  extracted: TrackerExtracted[]
}

/**
 * Ingesta MULTI-PANTALLAZO. `fallbackDate` (date-only, ej. hoy) se usa cuando
 * Vision no detecta fecha en una captura. Concurrencia 3.
 */
export async function ingestImages(
  files: File[],
  hint: ExtractHint | undefined,
  fallbackDate: string,
  onProgress?: (done: number, total: number) => void,
): Promise<ImageIngestResult> {
  const extracted: TrackerExtracted[] = new Array(files.length)
  let done = 0
  await runPool(files, 3, async (file, i) => {
    const { blob } = await compressForExtraction(file, 'manual_note')
    extracted[i] = await extractTrackerImage(blob, hint)
    done += 1
    onProgress?.(done, files.length)
  })

  const readings: NewPointInput[] = []
  let skipped = 0
  for (const ex of extracted) {
    if (ex && ex.value != null) {
      readings.push({
        value: ex.value,
        date: readingDate(fallbackDate),
        source: 'manual_screenshot',
        note: ex.raw_observations || undefined,
      })
    } else {
      skipped += 1
    }
  }
  return { readings, skipped, extracted: extracted.filter(Boolean) }
}

/** Ingesta por TEXTO PEGADO (sin Vision). Una lectura como mucho. */
export function ingestText(text: string, fallbackDate: string): NewPointInput | null {
  const year = Number(fallbackDate.slice(0, 4)) || new Date().getFullYear()
  const parsed = extractValueDateFromText(text, year)
  if (parsed.value == null) return null
  return {
    value: parsed.value,
    date: readingDate(fallbackDate),
    source: 'manual_text',
    note: text.slice(0, 160),
  }
}
