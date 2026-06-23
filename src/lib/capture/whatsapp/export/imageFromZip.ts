'use client'
// SIR V2 — Extrae fotos del .zip por STREAMING (sin OOM). Excluye stickers (.webp).
import { extractMatchingBlobs } from './zipStream'
import { isImageFileName } from './imageTriage'

function mimeForName(name: string): string {
  const n = name.toLowerCase()
  if (n.endsWith('.png')) return 'image/png'
  if (n.endsWith('.heic') || n.endsWith('.heif')) return 'image/heic'
  return 'image/jpeg'
}

export async function extractImageBlobs(file: Blob): Promise<Map<string, Blob>> {
  return extractMatchingBlobs(file, isImageFileName, mimeForName)
}
