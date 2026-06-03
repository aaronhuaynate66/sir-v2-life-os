// SIR V2 — Cliente de la AUTO-CAPTURA del perfil propio.
//
// Comprime UNA imagen (estrategia 'linkedin': densa + vertical + alta calidad,
// sirve igual para Instagram) y la manda a /api/identity/capture, que devuelve
// las anclas extraídas. El componente orquesta N imágenes con concurrencia
// acotada y consolida client-side (consolidateSelfProfiles). No persiste: la
// propuesta se revisa antes de guardar.

'use client'

import { compressForExtraction } from '@/lib/capture/scale/compress'
import type { SelfProfileExtracted } from '@/lib/capture/self-profile/types'

class HttpError extends Error {
  status: number
  detail?: string
  constructor(status: number, message: string, detail?: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.detail = detail
  }
}

async function readErrorBody(res: Response): Promise<{ error: string; detail?: string }> {
  try {
    return (await res.json()) as { error: string; detail?: string }
  } catch {
    return { error: `HTTP ${res.status}` }
  }
}

/**
 * Extrae las anclas de UNA imagen del perfil propio. Lanza HttpError si el
 * server responde !ok (el caller decide si omitir esa imagen y seguir).
 */
export async function extractSelfProfileImage(
  file: File,
  signal?: AbortSignal,
): Promise<SelfProfileExtracted> {
  // 'linkedin' → 1600px / q=0.95 / piso 300 KB: lo más nítido para perfiles
  // densos (sirve también para Instagram).
  const compressed = await compressForExtraction(file, 'linkedin')
  const formData = new FormData()
  formData.append('file', compressed.blob, 'self-profile.webp')

  const res = await fetch('/api/identity/capture', { method: 'POST', body: formData, signal })
  if (!res.ok) {
    const body = await readErrorBody(res)
    throw new HttpError(res.status, body.error, body.detail)
  }
  const json = (await res.json()) as { extracted: SelfProfileExtracted }
  return json.extracted
}

export { HttpError }
