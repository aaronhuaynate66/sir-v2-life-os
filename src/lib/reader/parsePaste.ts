// SIR V2 — Parser de conversación PEGADA (SIR Reader, camino simple sin extensión).
//
// El usuario copia un hilo de Teams (o Slack, o cualquier chat) y lo pega. El
// texto copiado NO tiene un formato garantizado, así que esto es BEST-EFFORT:
// detecta líneas-cabecera (autor + hora tipo "Fulano 10:30 a. m.") y agrupa el
// cuerpo bajo el último autor. Si no detecta estructura, cae a un solo bloque
// (el pipeline de conversación + LLM aguas abajo igual le saca sentido). PURO.

import type { ReaderMessage } from './ingest'

// Una línea es "cabecera" si contiene una hora HH:MM (con o sin am/pm). El autor
// es lo que va ANTES de la hora (nombre visible del que habló).
const TIME_RE = /\b(\d{1,2}:\d{2})\s*([ap]\.?\s?m\.?|[ap]m)?\b/i

function splitHeader(line: string): { author: string; rest: string } | null {
  const m = line.match(TIME_RE)
  if (!m || m.index == null) return null
  // La hora debe estar cerca del inicio (el autor es un nombre-prefijo, no una
  // oración larga que menciona una hora).
  if (m.index > 40) return null
  const author = line.slice(0, m.index).replace(/[·\-–—,]+\s*$/, '').trim()
  const rest = line.slice(m.index + m[0].length).replace(/^[·\-–—:,.\s]+/, '').trim()
  // Autor plausible: corto (nombre), pocas palabras.
  if (!author || author.length > 40 || author.split(/\s+/).length > 5) return null
  return { author, rest }
}

/**
 * Convierte texto pegado en mensajes. Best-effort: agrupa por autor detectado.
 * Si no hay estructura reconocible, devuelve un único mensaje con todo el texto.
 */
export function parsePastedConversation(text: string): ReaderMessage[] {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n')
  const msgs: ReaderMessage[] = []
  let author = ''
  let buffer: string[] = []

  const flush = () => {
    const body = buffer.join('\n').trim()
    if (body) msgs.push({ author, text: body, ts: null })
    buffer = []
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const header = splitHeader(line)
    if (header) {
      flush()
      author = header.author
      if (header.rest) buffer.push(header.rest)
    } else {
      buffer.push(line)
    }
  }
  flush()

  // Sin estructura → un solo bloque con todo (el LLM lo interpreta igual).
  if (msgs.length === 0) {
    const whole = String(text || '').trim()
    return whole ? [{ author: '', text: whole, ts: null }] : []
  }
  return msgs
}
