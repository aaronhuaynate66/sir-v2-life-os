// SIR V2 — Compresión client-side con Canvas nativo (sin deps)
//
// Convierte File de cualquier formato soportado por <img> (JPEG/PNG/HEIC*/WebP)
// a un Blob WebP comprimido. Target: ~1024px lado mayor, quality 0.85.
// Resultado tipico: 150-300 KB para un screenshot de smartphone.
//
// *HEIC: Safari iOS soporta HEIC nativo via <img>. Chrome/Firefox no.
// Si el browser no decodifica el File, esta función throw — el cliente
// debe mostrar mensaje claro.

'use client'

export interface CompressOptions {
  /** Lado mayor (px). Default: 1024. */
  maxSize?: number
  /** WebP quality 0-1. Default: 0.85. */
  quality?: number
}

export interface CompressResult {
  blob: Blob
  width: number
  height: number
  originalBytes: number
  compressedBytes: number
}

const DEFAULT_MAX_SIZE = 1024
const DEFAULT_QUALITY = 0.85

export async function compressImage(
  file: File,
  opts: CompressOptions = {},
): Promise<CompressResult> {
  const maxSize = opts.maxSize ?? DEFAULT_MAX_SIZE
  const quality = opts.quality ?? DEFAULT_QUALITY

  const url = URL.createObjectURL(file)
  let img: HTMLImageElement
  try {
    img = await loadImage(url)
  } finally {
    URL.revokeObjectURL(url)
  }

  const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
  const width = Math.round(img.width * scale)
  const height = Math.round(img.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo crear canvas 2D')
  ctx.drawImage(img, 0, 0, width, height)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Compresión a WebP falló'))),
      'image/webp',
      quality,
    )
  })

  return {
    blob,
    width,
    height,
    originalBytes: file.size,
    compressedBytes: blob.size,
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () =>
      reject(
        new Error(
          'No se pudo leer la imagen. Probá con otro formato (JPEG, PNG o WebP).',
        ),
      )
    img.src = src
  })
}

/**
 * Convierte un Blob a base64 sin el prefijo `data:image/...;base64,`.
 * Usado por el flujo cliente → API route para mandar la imagen al endpoint.
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('FileReader result no es string'))
        return
      }
      // result = "data:image/webp;base64,iVBORw..."
      const idx = result.indexOf(',')
      resolve(idx >= 0 ? result.slice(idx + 1) : result)
    }
    reader.onerror = () => reject(new Error('Error leyendo blob'))
    reader.readAsDataURL(blob)
  })
}
