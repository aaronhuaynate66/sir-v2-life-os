// SIR V2 — Partición de una TRANSCRIPCIÓN DE LLAMADA (texto libre) en bloques
// interpretables. PURO. A diferencia del export de WhatsApp (parseado en
// mensajes con timestamp), una transcripción de llamada del iPhone (Notas) es
// texto corrido tipo "Hablante 1: ... / Hablante 2: ...". No la parseamos a
// mensajes: la partimos en bloques de ~targetChars en límites de LÍNEA (nunca
// cortamos una línea) para interpretar cada bloque con UNA llamada al modelo.
//
// Doble cota igual que chunkConversation: targetChars + maxChunks. Una llamada
// típica entra en 1 bloque; el techo evita quemar créditos en transcripciones
// gigantes (si una línea sola excede el bloque, igual entra entera).

export interface ChunkTextOptions {
  /** Tamaño objetivo de bloque en caracteres. Default 13000. */
  targetChars?: number
  /** Máximo de bloques (techo de costo). Default 8. */
  maxChunks?: number
}

const DEFAULT_TARGET = 13_000
const DEFAULT_MAX_CHUNKS = 8

/**
 * Parte `text` en bloques de ~targetChars en límites de línea, respetando
 * maxChunks (si hace falta, agranda el tamaño efectivo del bloque). Devuelve
 * [] si el texto está vacío. Nunca pierde contenido ni corta una línea.
 */
export function chunkText(text: string, opts: ChunkTextOptions = {}): string[] {
  const target = Math.max(1000, opts.targetChars ?? DEFAULT_TARGET)
  const maxChunks = Math.max(1, opts.maxChunks ?? DEFAULT_MAX_CHUNKS)
  const trimmed = (text ?? '').trim()
  if (!trimmed) return []

  const lines = trimmed.split(/\r?\n/)
  const total = trimmed.length
  const maxLineLen = lines.reduce((m, l) => Math.max(m, l.length + 1), 0)
  // Tamaño efectivo: el mayor entre el objetivo y lo necesario para no pasar de
  // maxChunks bloques. Sumamos maxLineLen de holgura porque el packing greedy
  // (flush ANTES de exceder) deja cada bloque por debajo del tamaño efectivo.
  const effective = Math.max(target, Math.ceil(total / maxChunks) + maxLineLen)

  const chunks: string[] = []
  let buf: string[] = []
  let len = 0
  for (const line of lines) {
    const add = line.length + 1
    if (len > 0 && len + add > effective) {
      chunks.push(buf.join('\n').trim())
      buf = []
      len = 0
    }
    buf.push(line)
    len += add
  }
  if (buf.length > 0) {
    const last = buf.join('\n').trim()
    if (last) chunks.push(last)
  }
  return chunks.length > 0 ? chunks : [trimmed]
}
