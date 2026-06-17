// SIR V2 — Import INCREMENTAL del export de WhatsApp. PURO + testeable.
//
// Problema que resuelve: un export de WhatsApp es una FOTO completa del chat
// hasta el momento de exportar. Si re-exportás la misma conversación (que
// creció), el archivo trae TODO de nuevo. Sin esto, SIR reinterpretaba la
// historia entera y duplicaba — y el humano tenía que renombrar archivos para
// distinguir "el nuevo" del "viejo". Mal.
//
// Solución: SIR recuerda hasta qué fecha ya importó a esa persona
// (lastImportedISO = observed_at de la última observación whatsapp_chat). Al
// re-importar, nos quedamos SOLO con los mensajes POSTERIORES a esa marca. El
// mismo archivo subido N veces es seguro: la segunda vez no hay nada nuevo.
// Un archivo que creció: se procesa solo la cola nueva (ej. la pelea de ayer),
// no la historia entera. Cero renombrar, cero duplicar, cero trabajo extra.

import type { ExportMessage, ParsedExport } from './types'

/** Mensajes estrictamente posteriores a `sinceISO`. Si `sinceISO` es null
 *  (primer import de esta persona), devuelve todos. Los mensajes sin fecha
 *  resoluble se conservan SOLO en el primer import (en modo incremental son
 *  ambiguos → se descartan para no re-anexar ruido viejo). */
export function filterMessagesSince(
  messages: ExportMessage[],
  sinceISO: string | null,
): ExportMessage[] {
  if (!sinceISO) return messages.slice()
  return messages.filter((m) => typeof m.iso === 'string' && m.iso > sinceISO)
}

/** Recalcula firstISO/lastISO/mediaCount sobre un set de mensajes. */
function recomputeBounds(messages: ExportMessage[]): {
  firstISO: string | null
  lastISO: string | null
  mediaCount: number
} {
  let firstISO: string | null = null
  let lastISO: string | null = null
  let mediaCount = 0
  for (const m of messages) {
    if (m.isMedia) mediaCount++
    if (typeof m.iso === 'string') {
      if (firstISO === null || m.iso < firstISO) firstISO = m.iso
      if (lastISO === null || m.iso > lastISO) lastISO = m.iso
    }
  }
  return { firstISO, lastISO, mediaCount }
}

/** Devuelve un ParsedExport recortado a los mensajes nuevos (posteriores a
 *  `sinceISO`), con firstISO/lastISO/mediaCount recomputados sobre la ventana
 *  nueva. `participants` y `format` se conservan. Si `sinceISO` es null,
 *  devuelve el parsed original (clonando messages). */
export function sliceParsedSince(parsed: ParsedExport, sinceISO: string | null): ParsedExport {
  const messages = filterMessagesSince(parsed.messages, sinceISO)
  const { firstISO, lastISO, mediaCount } = recomputeBounds(messages)
  return {
    ...parsed,
    messages,
    mediaCount,
    firstISO,
    lastISO,
  }
}

/** Resumen para la UI: cuántos mensajes nuevos hay desde el último import. */
export interface IncrementalSummary {
  /** Marca hasta la que ya se había importado (null = primer import). */
  sinceISO: string | null
  /** Mensajes nuevos a procesar. */
  newCount: number
  /** Total de mensajes en el archivo. */
  totalCount: number
  /** ISO del primer mensaje nuevo (null si no hay nuevos). */
  firstNewISO: string | null
  /** ISO del último mensaje del archivo (la cresta). */
  lastISO: string | null
  /** true si ya había import previo y NO hay nada nuevo (archivo ya conocido). */
  isDuplicate: boolean
  /** true si es el primer import de esta persona. */
  isFirstImport: boolean
}

export function incrementalSummary(parsed: ParsedExport, sinceISO: string | null): IncrementalSummary {
  const isFirstImport = !sinceISO
  const newMsgs = filterMessagesSince(parsed.messages, sinceISO)
  const newCount = newMsgs.length
  const bounds = recomputeBounds(newMsgs)
  return {
    sinceISO,
    newCount,
    totalCount: parsed.messages.length,
    firstNewISO: bounds.firstISO,
    lastISO: parsed.lastISO,
    isDuplicate: !isFirstImport && newCount === 0,
    isFirstImport,
  }
}
