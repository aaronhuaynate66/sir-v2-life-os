// SIR V2 — Búsqueda dentro del historial CRUDO de una conversación. PURO.
// Dado el texto del export y una query, devuelve las líneas que matchean con su
// fecha. Acento-insensible. Para la bitácora ("buscá en el historial de X").

export interface ArchiveHit {
  /** Fecha del mensaje si la línea trae prefijo [D/M/Y, hh:mm] o D/M/Y - ... */
  date: string | null
  /** Línea/snippet (acotada). */
  snippet: string
}

function deburr(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const DATE_PREFIX = /^\s*\[?(\d{1,2}[/.]\d{1,2}[/.]\d{2,4})/

/** Líneas que contienen la query (acento/caso-insensible). Hasta `max`.
 *  Devuelve la fecha del prefijo de la línea si existe. PURO. */
export function searchArchive(rawText: string, query: string, max = 25): ArchiveHit[] {
  const q = deburr(query.trim())
  if (q.length < 2 || !rawText) return []
  const out: ArchiveHit[] = []
  for (const raw of rawText.split(/\r?\n/)) {
    if (!deburr(raw).includes(q)) continue
    const m = DATE_PREFIX.exec(raw)
    const snippet = raw.trim().slice(0, 300)
    out.push({ date: m ? m[1] : null, snippet })
    if (out.length >= max) break
  }
  return out
}

/** Mantiene el TRAMO MÁS RECIENTE del texto hasta `maxChars` (corta por el
 *  comienzo, en un salto de línea, para no partir un mensaje). Para respetar el
 *  límite de body al archivar chats grandes. PURO. */
export function tailCap(rawText: string, maxChars: number): { text: string; truncated: boolean } {
  if (rawText.length <= maxChars) return { text: rawText, truncated: false }
  const slice = rawText.slice(rawText.length - maxChars)
  const nl = slice.indexOf('\n')
  return { text: nl > 0 ? slice.slice(nl + 1) : slice, truncated: true }
}
