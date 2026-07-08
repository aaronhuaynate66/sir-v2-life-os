// SIR V2 — Filtro de señal de TONO en person_logs (interaction).
//
// Hallazgo (verificando por qué la predicción del ciclo daba plana): la mayoría
// de los person_logs kind='interaction' NO son un tono real — son PLACEHOLDERS:
//   - Llamadas ("📞 Llamada de voz · 21 s"): value=3 fijo, una llamada no tiene tono.
//   - Import masivo ("Importado del export de WhatsApp · N mensajes"): un marcador
//     de que se importó un chat entero, no una interacción de un día.
// Diana tenía 180 llamadas + 5 import-markers ahogando 7 interacciones REALES
// (que sí tenían tono repartido 1-5). Promediarlos aplasta todo a ~3.
//
// Estos logs SÍ cuentan para FRECUENCIA/recencia de contacto (hubo contacto),
// pero NO para el promedio de TONO. Este predicado los separa. PURO.

const CALL_RE = /^\s*📞|llamada de voz/i
const BULK_IMPORT_RE = /^\s*importado (del export|de un chat)/i

/**
 * true si el log de interacción lleva un TONO real (interacción tipeada o tono
 * inferido de una conversación), NO un placeholder de llamada / import masivo.
 * Logs sin nota se conservan (pueden ser una calificación manual sin comentario).
 */
export function isToneBearingInteraction(note: string | null | undefined): boolean {
  const n = (note ?? '').trim()
  if (!n) return true
  if (CALL_RE.test(n)) return false
  if (BULK_IMPORT_RE.test(n)) return false
  return true
}
