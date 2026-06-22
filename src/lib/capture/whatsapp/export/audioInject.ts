// SIR V2 — Inyección de transcripciones de notas de voz en el texto del export.
// PURO. El export de WhatsApp referencia cada audio por su NOMBRE DE ARCHIVO en
// una línea de adjunto (iOS: "<adjunto: NN-AUDIO-...opus>"; Android:
// "NN-AUDIO-...opus (archivo adjunto)"). Tras transcribir el .opus, reemplazamos
// esa referencia por el texto, así fluye por el mismo parser/intérprete como si
// la persona lo hubiera escrito.

import { clean, matchPrefix, toISO } from './parse'

const AUDIO_EXT_RE = /\.(opus|m4a|aac|mp3|ogg|wav|amr)$/i

/** ¿El nombre de archivo es un audio (nota de voz)? */
export function isAudioFileName(name: string): boolean {
  return AUDIO_EXT_RE.test(name) && !/__macosx/i.test(name)
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * De los audios disponibles (nombres base del zip), devuelve los que aparecen
 * referenciados en el texto, los MÁS RECIENTES primero (por posición en el
 * archivo = orden cronológico), hasta `cap`. Evita transcribir cientos de notas.
 */
export function pickRecentAudioRefs(
  text: string,
  available: Iterable<string>,
  cap = 25,
  sinceISO: string | null = null,
): string[] {
  const avail = [...available]
  if (avail.length === 0) return []
  const lines = text.split(/\r?\n/)
  const lastIdx = new Map<string, number>()
  const isoByName = new Map<string, string>()
  let curISO: string | null = null
  for (let i = 0; i < lines.length; i++) {
    const pref = matchPrefix(clean(lines[i]))
    if (pref) { const iso = toISO(pref.date, pref.time, pref.ampm); if (iso) curISO = iso }
    for (const name of avail) {
      if (lines[i].includes(name)) { lastIdx.set(name, i); if (curISO) isoByName.set(name, curISO) }
    }
  }
  let entries = [...lastIdx.entries()].sort((a, b) => b[1] - a[1])
  // INCREMENTAL: si hay marcador, solo audios de mensajes POSTERIORES (estricto).
  // Sin fecha resuelta para un audio → lo dejamos pasar solo si no hay sinceISO.
  if (sinceISO) entries = entries.filter(([name]) => { const iso = isoByName.get(name); return !!iso && iso > sinceISO })
  return entries.slice(0, Math.max(0, cap)).map((e) => e[0])
}

/**
 * Reemplaza en el texto cada referencia de adjunto de audio por su
 * transcripción. Cubre el formato iOS (<adjunto:/attached: nombre>) y Android
 * (nombre (archivo adjunto) / (file attached)). Si un audio no tiene
 * transcripción, se deja como estaba.
 */
export function injectAudioTranscripts(text: string, transcripts: Map<string, string>): string {
  let out = text
  for (const [name, raw] of transcripts) {
    const tr = (raw || '').replace(/\s+/g, ' ').trim()
    if (!tr) continue
    const f = escapeRe(name)
    const repl = `Nota de voz: "${tr}"`
    out = out
      .replace(new RegExp(`\\u200e?<\\s*(?:adjunto|attached)\\s*:\\s*${f}\\s*>`, 'gi'), repl)
      .replace(new RegExp(`${f}\\s*\\((?:archivo adjunto|file attached)\\)`, 'gi'), repl)
  }
  return out
}
