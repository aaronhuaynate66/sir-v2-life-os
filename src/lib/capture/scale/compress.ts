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

import {
  DETECTION_STRATEGY,
  getStrategy,
  type CompressionStrategy,
} from './compress-strategy'
import type { CaptureType } from '../observations/types'

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

/** Resultado del flujo adaptativo (Sesion 2.5). Reporta cada intento que
 *  hizo el loop para que la UI muestre transparencia. */
export interface AdaptiveCompressResult extends CompressResult {
  /** Strategy efectivamente aplicada (post-ajuste si hubo loop). */
  strategy: CompressionStrategy
  /** Quality final tras el loop. Igual a strategy.quality si no hubo bump. */
  finalQuality: number
  /** Cuantos pases hizo el loop (1 = solo el inicial). */
  attempts: number
  /** True si toco el techo q=0.98 sin llegar a minOutputKB. */
  hitCeiling: boolean
}

const DEFAULT_MAX_SIZE = 1024
const DEFAULT_QUALITY = 0.85

/** Techo del loop adaptativo para evitar busqueda infinita. */
const MAX_QUALITY_CEILING = 0.98
/** Incremento por iteracion. */
const QUALITY_STEP = 0.05

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

/**
 * Compresion AGRESIVA para el primer pase (detector universal).
 *
 * El detector solo necesita resolver capture_type + suggestedPersonName,
 * NO leer texto fino — asi que tiramos calidad y tamaño abajo para que
 * la primera llamada Vision sea rapida y barata.
 *
 * Strategy fija: 1080px lado mayor / quality 0.7 / minOutputKB 30.
 *
 * Si el original ya pesa menos del piso, devolvemos el blob comprimido
 * sin warning — pasar bytes adicionales no agrega senal para clasificar.
 */
export async function compressForDetection(
  file: File,
): Promise<AdaptiveCompressResult> {
  return runAdaptive(file, DETECTION_STRATEGY)
}

/**
 * Compresion ADAPTATIVA para el extractor especifico segun capture_type.
 *
 * Estrategia (ver compress-strategy.ts):
 *   - whatsapp_chat / whatsapp_info: 1080px / q=0.75 / piso 50 KB
 *   - instagram                    : 1080px / q=0.85 / piso 100 KB
 *   - linkedin                     : 1600px / q=0.95 / piso 300 KB
 *   - default (manual/voice/unknown): 1600px / q=0.85 / piso 100 KB
 *
 * Algoritmo:
 *   1. Comprimir a quality inicial.
 *   2. Si output >= minOutputKB -> devolver.
 *   3. Si no, quality += 0.05, repetir.
 *   4. Techo en q=0.98 (marcar hitCeiling=true y devolver el mejor).
 *
 * El piso garantiza que screenshots densos como LinkedIn no terminen
 * en 42 KB ilegibles — para esos el loop sube quality hasta 0.98 hasta
 * tocar 300 KB.
 */
export async function compressForExtraction(
  file: File,
  captureType: CaptureType,
): Promise<AdaptiveCompressResult> {
  return runAdaptive(file, getStrategy(captureType))
}

/** Implementacion comun del loop adaptativo. Cachea la imagen decoded para
 *  no recrearla en cada iteracion. */
async function runAdaptive(
  file: File,
  strategy: CompressionStrategy,
): Promise<AdaptiveCompressResult> {
  const url = URL.createObjectURL(file)
  let img: HTMLImageElement
  try {
    img = await loadImage(url)
  } finally {
    URL.revokeObjectURL(url)
  }

  const scale = Math.min(1, strategy.maxWidth / Math.max(img.width, img.height))
  const width = Math.round(img.width * scale)
  const height = Math.round(img.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo crear canvas 2D')
  ctx.drawImage(img, 0, 0, width, height)

  const minBytes = strategy.minOutputKB * 1024
  let quality = strategy.quality
  let blob = await canvasToBlob(canvas, quality)
  let attempts = 1
  let hitCeiling = false

  // Si el FILE ORIGINAL ya pesa menos que el piso, no podemos crear bytes
  // de la nada — devolvemos el primer intento sin bumpear.
  if (file.size <= minBytes) {
    return {
      blob,
      width,
      height,
      originalBytes: file.size,
      compressedBytes: blob.size,
      strategy,
      finalQuality: quality,
      attempts,
      hitCeiling: false,
    }
  }

  while (blob.size < minBytes && quality < MAX_QUALITY_CEILING) {
    const nextQuality = Math.min(MAX_QUALITY_CEILING, quality + QUALITY_STEP)
    if (nextQuality === quality) break // proteccion adicional
    quality = nextQuality
    blob = await canvasToBlob(canvas, quality)
    attempts += 1
    if (quality >= MAX_QUALITY_CEILING && blob.size < minBytes) {
      hitCeiling = true
      break
    }
  }

  return {
    blob,
    width,
    height,
    originalBytes: file.size,
    compressedBytes: blob.size,
    strategy,
    finalQuality: quality,
    attempts,
    hitCeiling,
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Compresión a WebP falló'))),
      'image/webp',
      quality,
    )
  })
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
