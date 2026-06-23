'use client'
// SIR V2 — Extrae stickers (.webp) del .zip por STREAMING (sin OOM).
import { extractMatchingBlobs } from './zipStream'
import { isStickerFileName } from './stickerTone'

export async function extractStickerBlobs(file: Blob): Promise<Map<string, Blob>> {
  return extractMatchingBlobs(file, isStickerFileName, () => 'image/webp')
}
