// SIR V2 — Cliente del detector universal.
//
// Wrapper sobre POST /api/capture (Sesion 1). Comprime la imagen
// client-side antes de subirla, posta FormData y devuelve el
// DetectorResult parseado.

'use client'

import { compressForDetection } from '@/lib/capture/scale/compress'
import type {
  CaptureType,
  CaptureDetectError,
  CaptureDetectResponse,
  DetectorResult,
} from '@/lib/capture/observations/types'

const ENDPOINT = '/api/capture'

export interface DetectOptions {
  /** Cuando el cliente sabe el tipo (atajo desde paths tipados),
   *  evita gastar tokens en Vision. */
  captureTypeHint?: CaptureType
}

export interface DetectResult {
  detected: DetectorResult
  /** Raw text del modelo (para debug). '(hint)' si se uso captureTypeHint. */
  raw: string
  /** Bytes originales del File. */
  originalBytes: number
  /** Bytes del blob enviado al detector (perfil DETECTION_STRATEGY). */
  compressedBytes: number
  /** Quality final del pase de detection (informativo). */
  detectionQuality: number
}

class DetectorError extends Error {
  status: number
  detail?: string
  constructor(status: number, error: string, detail?: string) {
    super(error)
    this.name = 'DetectorError'
    this.status = status
    this.detail = detail
  }
}

/**
 * Sube `file` al detector. Comprime client-side con perfil DETECTION
 * (1080px / q=0.7), posta a /api/capture, devuelve el resultado parseado.
 *
 * Importante: NO retiene el blob comprimido. El extractor especifico
 * (PASO 2 del flujo) debe recomprimir desde el File original con la
 * strategy del capture_type detectado para evitar perder detalle.
 *
 * Throws DetectorError con status preciso.
 */
export async function detectCaptureType(
  file: File,
  opts: DetectOptions = {},
): Promise<DetectResult> {
  const compressed = await compressForDetection(file)

  const formData = new FormData()
  formData.append('file', compressed.blob, file.name.replace(/\.[^.]+$/, '.webp'))
  if (opts.captureTypeHint) {
    formData.append('capture_type_hint', opts.captureTypeHint)
  }

  let res: Response
  try {
    res = await fetch(ENDPOINT, { method: 'POST', body: formData })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new DetectorError(0, 'Sin conexion al servidor', msg)
  }

  if (!res.ok) {
    let body: CaptureDetectError = { error: `HTTP ${res.status}` }
    try {
      body = (await res.json()) as CaptureDetectError
    } catch {
      // si el body no es JSON, mantener default
    }
    throw new DetectorError(res.status, body.error, body.detail)
  }

  const json = (await res.json()) as CaptureDetectResponse
  return {
    detected: json.detected,
    raw: json.raw,
    originalBytes: compressed.originalBytes,
    compressedBytes: compressed.compressedBytes,
    detectionQuality: compressed.finalQuality,
  }
}

export { DetectorError }
