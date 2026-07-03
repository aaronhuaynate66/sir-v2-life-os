// SIR V2 — Transcripción por foto para "Contale a SIR" (relato).
//
// Aaron (03-jul): en /relato/ingest el clip solo deja adjuntar PDF. Cuando SIR
// le muestra un dato que venía preguntando (ej. el cumple de los Heilbrunn) y le
// aparece en pantalla, no tiene cómo TOMARLE FOTO y que SIR lo procese de una.
// Este módulo es la capa pura: el prompt de Visión que transcribe TODO dato útil
// visible a prosa en español, lista para caer en el input del relato (donde el
// pipeline de siempre la estructura: cumples, episodios, notas, etc.).
//
// La foto NO se guarda: se transcribe a texto y se descarta (mismo espíritu que
// el adjunto de PDF, que solo extrae texto).

/** System prompt de la transcripción. Pide prosa fiel, sin invención, con las
 *  fechas/cumpleaños hechos explícitos para que el router del relato los tome. */
export const RELATO_TRANSCRIBE_SYSTEM_PROMPT = `Sos SIR V2. Te paso una FOTO (una pantalla, una tarjeta, un cartel, una captura).
Tu trabajo es TRANSCRIBIR a prosa, en español, TODO dato útil que se vea: nombres y apellidos,
cargos, empresas, fechas, cumpleaños, teléfonos, direcciones, montos, lo que sea.

Reglas:
- NO inventes NADA. Transcribí solo lo que está en la imagen. Si algo está cortado o ilegible, omitilo.
- Escribí las FECHAS de forma explícita y natural. Si ves un cumpleaños, decilo así:
  "Alex Heilbrunn cumple el 31 de julio." (una oración por persona).
- Preferí nombres COMPLETOS (nombre + apellido) cuando la imagen los muestre.
- Devolvé SOLO el texto en prosa, sin encabezados, sin viñetas, sin comillas de bloque,
  sin explicar qué hiciste. Ese texto va directo al input de "Contale a SIR".
- Si la imagen no tiene ningún dato útil (borrosa, sin texto), devolvé exactamente: SIN_DATOS`

/** Sentinel que el modelo devuelve cuando no hay nada transcribible. */
export const NO_DATA_SENTINEL = 'SIN_DATOS'

function stripFences(s: string): string {
  const t = s.trim()
  return t.startsWith('```') ? t.replace(/^```(?:\w+)?\s*/i, '').replace(/\s*```$/i, '').trim() : t
}

/**
 * Limpia la respuesta del modelo: quita fences, recorta a `max` chars. Devuelve
 * null si está vacía o es el sentinel SIN_DATOS (→ el caller avisa "no vi datos").
 */
export function cleanTranscription(raw: string, max = 4000): string | null {
  const t = stripFences(raw).trim()
  if (!t || t.toUpperCase() === NO_DATA_SENTINEL) return null
  return t.length > max ? t.slice(0, max).trimEnd() + '…' : t
}
