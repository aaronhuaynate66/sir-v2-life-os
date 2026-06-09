// SIR V2 — Partición de la conversación en BLOQUES interpretables. PURO.
//
// Una conversación real supera holgadamente el tope de tokens de un solo
// prompt y el maxDuration de Vercel. La partimos en bloques en LÍMITES DE
// MENSAJE (nunca cortamos un mensaje a la mitad) para interpretar cada bloque
// con UNA llamada LLM (orquestada desde el cliente, con progreso).
//
// Doble cota:
//   - targetChars : tamaño objetivo de cada bloque (legibilidad + costo).
//   - maxChunks   : techo de cantidad de bloques. Si la conversación es tan
//                   larga que el tamaño objetivo daría más bloques que
//                   maxChunks, AGRANDAMOS el tamaño efectivo del bloque para
//                   que el total nunca supere maxChunks. Así el nº de llamadas
//                   LLM es FINITO por más larga que sea la charla (sin truncar
//                   ni perder cola: todos los mensajes entran en algún bloque).

import type { ConversationChunk, ExportMessage } from './types'

export interface ChunkOptions {
  /** Tamaño objetivo de bloque en caracteres. Default 16000. */
  targetChars?: number
  /** Máximo de bloques. Default 50. */
  maxChunks?: number
}

const DEFAULT_TARGET = 16_000
const DEFAULT_MAX_CHUNKS = 50

/** Fecha YYYY-MM-DD del mensaje (de su ISO), o '????-??-??' si no se resolvió. */
function lineDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '????-??-??'
}

/** Renderiza un mensaje como línea de bloque: "[YYYY-MM-DD HH:mm] Autor: contenido".
 *  Incluir la FECHA (no solo la hora) es clave: deja que el modelo ancle fechas
 *  relativas ("mañana", "del 1 al 4", "el sábado") al día real del mensaje. */
function renderLine(m: ExportMessage): string {
  return `[${lineDate(m.iso)} ${m.time}] ${m.author}: ${m.content.replace(/\n/g, ' ')}`
}

/**
 * Parte los mensajes en bloques de ~targetChars (en límites de mensaje),
 * respetando el techo maxChunks. Devuelve los bloques con su texto renderizado
 * y rango de fechas. Lista vacía si no hay mensajes.
 */
export function chunkConversation(
  messages: ExportMessage[],
  opts: ChunkOptions = {},
): ConversationChunk[] {
  const targetChars = Math.max(2000, opts.targetChars ?? DEFAULT_TARGET)
  const maxChunks = Math.max(1, opts.maxChunks ?? DEFAULT_MAX_CHUNKS)
  if (messages.length === 0) return []

  const lines = messages.map(renderLine)
  const totalChars = lines.reduce((acc, l) => acc + l.length + 1, 0)
  const maxLineLen = lines.reduce((m, l) => Math.max(m, l.length + 1), 0)

  // Tamaño efectivo: el mayor entre el objetivo y lo necesario para NO pasarse
  // de maxChunks bloques. Sumamos maxLineLen como holgura de borde: el packing
  // greedy (flush antes de exceder) deja cada bloque > C - maxLineLen, así que
  // con C = ceil(total/maxChunks) + maxLineLen el nº de bloques queda ≤ maxChunks.
  const effectiveTarget = Math.max(targetChars, Math.ceil(totalChars / maxChunks) + maxLineLen)

  const chunks: ConversationChunk[] = []
  let buf: string[] = []
  let bufMsgs: ExportMessage[] = []
  let bufLen = 0

  const flush = () => {
    if (bufMsgs.length === 0) return
    const isoList = bufMsgs.map((m) => m.iso).filter((x): x is string => x !== null)
    chunks.push({
      index: chunks.length,
      text: buf.join('\n'),
      messageCount: bufMsgs.length,
      firstISO: isoList.length > 0 ? isoList.reduce((a, b) => (a < b ? a : b)) : null,
      lastISO: isoList.length > 0 ? isoList.reduce((a, b) => (a > b ? a : b)) : null,
    })
    buf = []
    bufMsgs = []
    bufLen = 0
  }

  for (let i = 0; i < messages.length; i++) {
    const line = lines[i]
    // Si agregar este mensaje supera el objetivo y el bloque ya tiene algo,
    // cerramos el bloque actual primero (corte en límite de mensaje).
    if (bufLen > 0 && bufLen + line.length + 1 > effectiveTarget) {
      flush()
    }
    buf.push(line)
    bufMsgs.push(messages[i])
    bufLen += line.length + 1
  }
  flush()

  return chunks
}
