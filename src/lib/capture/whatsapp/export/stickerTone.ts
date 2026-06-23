// SIR V2 — Stickers como SEÑAL DE TONO. PURO. El sticker NO es contenido a
// guardar: expresa con qué carga emocional se hablan (humor, cariño, fastidio,
// bajar tensión). Lo anotamos inline como "(sticker: X)" para que el intérprete
// de tono (interpretChunk → toneScore) lo lea. No va a la bitácora como dato.
import { pickRecentAudioRefs } from './audioInject'

/** Sticker = .webp del export (no foto jpg/png, no audio). */
export function isStickerFileName(name: string): boolean {
  return /\.webp$/i.test(name) && !/__macosx/i.test(name)
}

export function pickRecentStickerRefs(text: string, available: Iterable<string>, cap = 20, sinceISO: string | null = null): string[] {
  return pickRecentAudioRefs(text, available, cap, sinceISO)
}

function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

/** Reemplaza la referencia del sticker por una anotación de tono corta. */
export function injectStickerTones(text: string, tones: Map<string, string>): string {
  let out = text
  for (const [name, raw] of tones) {
    const t = (raw || '').replace(/\s+/g, ' ').trim().slice(0, 40)
    if (!t) continue
    const f = escapeRe(name)
    const repl = `(envió un sticker · tono: ${t})`
    out = out
      .replace(new RegExp(`\\u200e?<\\s*(?:adjunto|attached)\\s*:\\s*${f}\\s*>`, 'gi'), repl)
      .replace(new RegExp(`${f}\\s*\\((?:archivo adjunto|file attached)\\)`, 'gi'), repl)
  }
  return out
}
