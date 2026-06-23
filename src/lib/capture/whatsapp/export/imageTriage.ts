// SIR V2 — Triage de IMÁGENES del export de WhatsApp. PURO.
// No todas las imágenes valen: una foto familiar/de viaje NO se guarda; un
// screenshot importante o foto de DOCUMENTO sí (extraemos su data). La
// clasificación la hace la visión (endpoint); acá: detectar archivos de imagen
// (no stickers .webp, no audios) e inyectar el texto extraído de las útiles.
import { pickRecentAudioRefs } from './audioInject'

const IMG_EXT_RE = /\.(jpe?g|png|heic|heif)$/i

/** ¿Es un archivo de imagen "foto" (no sticker .webp, no audio)? */
export function isImageFileName(name: string): boolean {
  return IMG_EXT_RE.test(name) && !/__macosx/i.test(name)
}

/** Selector de las imágenes referenciadas más recientes (reusa el de audios,
 *  que es genérico por nombre de archivo). */
export function pickRecentImageRefs(text: string, available: Iterable<string>, cap = 15, sinceISO: string | null = null): string[] {
  return pickRecentAudioRefs(text, available, cap, sinceISO)
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Reemplaza la referencia de adjunto de cada imagen ÚTIL por su data extraída.
 *  Las imágenes personales NO entran en `extracted` → quedan como estaban. */
export function injectImageTexts(text: string, extracted: Map<string, string>): string {
  let out = text
  for (const [name, raw] of extracted) {
    const data = (raw || '').replace(/\s+/g, ' ').trim()
    if (!data) continue
    const f = escapeRe(name)
    const repl = `📄 Imagen (documento/captura): ${data}`
    out = out
      .replace(new RegExp(`\\u200e?<\\s*(?:adjunto|attached)\\s*:\\s*${f}\\s*>`, 'gi'), repl)
      .replace(new RegExp(`${f}\\s*\\((?:archivo adjunto|file attached)\\)`, 'gi'), repl)
  }
  return out
}
