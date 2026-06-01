'use client'
// SIR V2 — Cliente de extracción de documentos por visión.
// Comprime la imagen (alta calidad para que los números sean legibles),
// la manda a /api/capture/document y devuelve los campos extraídos.

import { compressImage, blobToBase64 } from '@/lib/capture/scale/compress'
import type { DocumentExtracted } from './types'

/** Extrae los campos de un documento (DNI/CE/pasaporte) desde una foto. */
export async function extractDocument(file: File, signal?: AbortSignal): Promise<DocumentExtracted> {
  // 1600px / q=0.92: documentos tienen texto/números finos → conservador
  // (mismo espíritu que la strategy 'linkedin'), sin acoplar a un CaptureType.
  const { blob } = await compressImage(file, { maxSize: 1600, quality: 0.92 })
  const imageBase64 = await blobToBase64(blob)

  const res = await fetch('/api/capture/document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mimeType: blob.type || 'image/webp' }),
    signal,
  })
  if (!res.ok) {
    let detail: string | undefined
    try {
      const body = (await res.json()) as { error?: string; detail?: string }
      detail = body.error ?? body.detail
    } catch {
      detail = `HTTP ${res.status}`
    }
    throw new Error(detail ?? `Falló la extracción del documento (${res.status})`)
  }
  return (await res.json()) as DocumentExtracted
}
