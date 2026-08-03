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

// ═══ EL OTRO LADO DEL LOOP: LO QUE AARON IGNORÓ ══════════════════════════════
//
// Medido el 3-ago-2026, 12 días después de estrenar el ledger: **15 filas, y
// `outcome` en null en TODAS**. El cierre de arriba funciona bien — lo que pasa es
// que solo sabe cerrar el ÉXITO. Si SIR sugiere "escríbele a Esteban" y Aaron no le
// escribe, la sugerencia se queda `pending` para siempre.
//
// Y ese es el caso mayoritario: 11 de las 12 sugerencias de contacto seguían
// pendientes, la más vieja del 22-jul. O sea que el cerebro llevaba 12 días sin
// recibir **ni una** señal de aprendizaje, y P4 (ajustar el scoring por outcome)
// quedaba bloqueado "por falta de data" cuando la data existía: era el silencio.
//
// Que Aaron IGNORE una sugerencia es el dato más valioso que hay — le dice a SIR que
// esa sugerencia no le servía, o que llegó en mal momento. Es lo único que puede
// hacer que deje de repetirla. Un ledger que solo registra aciertos no aprende:
// solo se felicita.
//
// Por qué `outcome: 'ignored'` y no `'didnt'`: son cosas distintas y confundirlas
// arruina el aprendizaje. `didnt` es "lo intenté y no funcionó" (información sobre
// el MUNDO); `ignored` es "no lo hice" (información sobre la SUGERENCIA). La segunda
// es la que dice si SIR está sugiriendo bien.

/** Días que una sugerencia de contacto puede quedarse esperando antes de darla por
 *  ignorada.
 *
 *  Siete y no menos: una sugerencia de contacto es "hoy es buen momento", pero Aaron
 *  puede leer el brief del lunes y escribirle el jueves, y eso SÍ es un acierto.
 *  Cerrarla a los 2 días marcaría como ignorado algo que estaba por pasar. Siete y no
 *  más: pasada una semana, la ventana de "buen momento" ya no existe. */
export const DIAS_PARA_IGNORADA = 7

export interface SugerenciaVieja {
  id: string
  createdAt: string
}

/**
 * De las sugerencias que siguen pendientes y SIN interacción, cuáles ya cumplieron
 * su plazo y deben cerrarse como ignoradas. PURA.
 *
 * El caller ya verificó con `contactWasFollowed` que no hubo interacción: acá solo se
 * decide por antigüedad. Devuelve los ids, para que el update sea uno solo.
 */
export function sugerenciasIgnoradas(
  pendientes: readonly SugerenciaVieja[],
  now: Date = new Date(),
): string[] {
  const corte = now.getTime() - DIAS_PARA_IGNORADA * 86_400_000
  const out: string[] = []
  for (const s of pendientes ?? []) {
    if (!s?.id || !s?.createdAt) continue
    const t = Date.parse(s.createdAt)
    // Sin fecha parseable no se cierra: mejor dejarla pendiente que inventar un
    // outcome falso, que envenenaría lo que el cerebro aprende.
    if (!Number.isFinite(t)) continue
    if (t <= corte) out.push(s.id)
  }
  return out
}
