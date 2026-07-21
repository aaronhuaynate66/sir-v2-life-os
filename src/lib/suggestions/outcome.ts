// SIR V2 — Cierre AUTOMÁTICO del loop de sugerencias relacionales (PURO).
//
// P3 del cerebro: cuando SIR sugiere "escríbele a X" y DESPUÉS aparece una
// interacción real con X (un person_log de interacción o un mensaje nuevo de
// WhatsApp), la sugerencia se marca 'worked' sola — sin que Aaron confirme nada.
// El import de WhatsApp que ya existe se vuelve señal de outcome gratis.

/** ¿Alguna interacción con la persona ocurrió A PARTIR de que se hizo la
 *  sugerencia? `sinceIso` = created_at de la sugerencia; `times` = timestamps ISO
 *  de interacciones (person_logs) y/o mensajes (chat_messages) con esa persona.
 *  Tolerante: ignora timestamps no parseables. PURO. */
export function contactWasFollowed(sinceIso: string, times: Array<string | null | undefined>): boolean {
  const since = Date.parse(sinceIso)
  if (!Number.isFinite(since)) return false
  for (const t of times) {
    if (!t) continue
    const ms = Date.parse(t)
    // margen de 60s: una interacción registrada "junto" a la sugerencia cuenta.
    if (Number.isFinite(ms) && ms >= since - 60_000) return true
  }
  return false
}

/** Id determinístico de una sugerencia de contacto (1 por persona por día) para
 *  no duplicar en cada corrida del push. El caller le antepone el sha1. */
export function contactSuggestionSeed(userId: string, personId: string, dayIso: string): string {
  return `${userId}|contact|${personId}|${dayIso}`
}
