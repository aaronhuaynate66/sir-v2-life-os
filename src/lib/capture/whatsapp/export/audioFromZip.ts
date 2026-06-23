'use client'
// SIR V2 — Extrae audios (notas de voz) del .zip por STREAMING (sin OOM).
import { extractMatchingBlobs } from './zipStream'
import { isAudioFileName } from './audioInject'

function mimeForName(name: string): string {
  const n = name.toLowerCase()
  if (n.endsWith('.opus') || n.endsWith('.ogg')) return 'audio/ogg'
  if (n.endsWith('.m4a') || n.endsWith('.mp4')) return 'audio/mp4'
  if (n.endsWith('.mp3')) return 'audio/mpeg'
  if (n.endsWith('.wav')) return 'audio/wav'
  if (n.endsWith('.aac')) return 'audio/aac'
  if (n.endsWith('.amr')) return 'audio/amr'
  return 'application/octet-stream'
}

export async function extractAudioBlobs(file: Blob): Promise<Map<string, Blob>> {
  return extractMatchingBlobs(file, isAudioFileName, mimeForName)
}
