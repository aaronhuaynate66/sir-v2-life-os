// SIR V2 — Inferencia del nombre del CONTACTO de un export de WhatsApp. PURO.
//
// Al subir un export (.zip/.txt) FUERA del detalle de una persona, todavía no
// sabemos a quién pertenece. WhatsApp nombra el export del chat 1:1 con el
// nombre del otro participante ("WhatsApp Chat - Fernando Brañes Papa.zip"),
// así que el nombre del archivo es la mejor pista para prellenar "crear persona
// nueva" o el buscador. Como respaldo, usamos los participantes parseados.
//
// Pura y testeable (sin imports → corre con node --experimental-strip-types).

/** Normaliza para comparar nombres (sin acentos, minúsculas, sin espacios extra). */
function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Limpia el nombre del archivo del export para quedarnos con el nombre del
 * contacto: saca la extensión, los prefijos típicos de WhatsApp (es/en/pt) y el
 * sufijo de hash que el sistema agrega cuando hay nombres repetidos
 * ("…-528af339").
 */
export function cleanExportFileName(fileName: string): string {
  let n = (fileName ?? '').trim()
  // Extensión.
  n = n.replace(/\.(zip|txt)$/i, '')
  // Prefijos de WhatsApp en distintos idiomas.
  const prefixes = [
    /^whatsapp chat - /i,
    /^chat de whatsapp con /i,
    /^chat de whatsapp - /i,
    /^conversa do whatsapp com /i,
    /^conversación de whatsapp con /i,
  ]
  for (const p of prefixes) {
    if (p.test(n)) {
      n = n.replace(p, '')
      break
    }
  }
  // Sufijo de hash hex que agregan los uploads ("-528af339", "-f07f6674").
  n = n.replace(/-[0-9a-f]{6,}$/i, '')
  return n.trim()
}

export interface InferContactNameInput {
  /** Nombre del archivo subido (ej. "WhatsApp Chat - Ana Pérez.zip"). */
  fileName?: string | null
  /** Participantes únicos detectados por el parser. */
  participants?: string[]
}

/**
 * Devuelve el mejor candidato a nombre del contacto. Prioridad:
 *   1. Nombre del archivo limpio. Si matchea (laxo) a un participante, devuelve
 *      el display EXACTO del participante (mejor casing/acentos).
 *   2. Sin pista de archivo: con un solo participante, ese; con varios no se
 *      puede distinguir al usuario del contacto sin más señal → el primero.
 * '' si no hay nada utilizable.
 */
export function inferContactName(input: InferContactNameInput): string {
  const fromFile = input.fileName ? cleanExportFileName(input.fileName) : ''
  const parts = (input.participants ?? []).filter(
    (p) => typeof p === 'string' && p.trim().length > 0,
  )

  if (fromFile) {
    const t = norm(fromFile)
    const match = parts.find((p) => {
      const n = norm(p)
      return n.length > 0 && (n === t || n.includes(t) || t.includes(n))
    })
    return match ?? fromFile
  }

  if (parts.length > 0) return parts[0]
  return ''
}
