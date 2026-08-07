// SIR V2 — Cuál es el último contacto REAL con una persona. PURO.
//
// ═══ POR QUÉ EXISTE ═══════════════════════════════════════════════════════════
//
// Hay dos fuentes de "cuándo hablé con esta persona por última vez" y ninguna es
// completa:
//
//   · `people.last_contact` — un campo que, hasta el 6-ago-2026, **el reader nunca
//     escribía**. Lo movían solo la captura manual, el import y un backfill viejo.
//     Medido ese día: Diana lo tenía en el 29-jul, ocho días atrasado.
//   · El último mensaje del SUSTRATO (`chat_messages`), que es la fuente viva… pero
//     se lee por una ventana ACOTADA. Para alguien con quien no habla desde hace
//     meses, esa ventana viene vacía y no dice nada.
//
// Cada una miente por su lado: la primera se queda vieja, la segunda no ve lejos.
// El más reciente de los dos es el único dato honesto.
//
// El bug que esto cierra es del tipo [[sir-computa-y-descarta]]: `askSir` ya
// calculaba el último mensaje del sustrato y después le pasaba `last_contact` al
// cálculo del score. Castigaba a Diana por una semana de silencio que no existió.

/**
 * El más reciente de varios instantes ISO. null si no hay ninguno usable. PURA.
 *
 * Compara como STRING a propósito: los ISO-8601 en UTC ordenan lexicográficamente
 * igual que cronológicamente, y así una fecha inválida no envenena el resultado con
 * un `NaN` (que en una comparación numérica gana o pierde según el operador).
 */
export function contactoMasReciente(...isos: Array<string | null | undefined>): string | null {
  const usables = (isos ?? [])
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter((s) => s.length > 0 && Number.isFinite(Date.parse(s)))
  if (usables.length === 0) return null
  // Se normaliza a UTC para que dos formatos distintos (con y sin offset) se puedan
  // comparar como texto sin que el offset cambie el orden.
  return usables.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a))
}
