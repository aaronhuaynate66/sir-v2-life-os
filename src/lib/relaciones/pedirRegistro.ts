// SIR V2 — "Anoche viste a X, ¿cómo fue?": PEDIR el registro, no esperarlo. PURO.
//
// ═══ EL PEDIDO DE AARON, TEXTUAL ═════════════════════════════════════════════
//
// 31-jul-2026: *"creo que todo esto se arrastra porque no tenemos un método más
// eficiente que te inyecte cada vez que tenga una conversación o nuevo mensaje de
// Diana"*. Y la prueba: *"sí hemos conversado el día lunes, solo que como fue verbal
// no hay registro de eso"*.
//
// El reader trae WhatsApp solo. **Lo presencial no existe para SIR.** Ese día su
// motor de estado seguía leyendo el 29-jul y llamaba "estable" a la relación mientras
// él y Diana discutían.
//
// Y lo más incómodo: **el camino para registrarlo YA EXISTÍA** — el panel de la ficha
// y la acción `registrar_interaccion` desde el chat. El problema es que era PULL: hay
// que acordarse. SIR nunca le decía *"anoche viste a Diana, cuéntame cómo fue"*.
//
// Esto lo da vuelta: si hubo un encuentro AGENDADO que ya pasó y no quedó registro,
// SIR lo pregunta. Es la diferencia entre un archivo y un asistente.
//
// PURO: cero red, cero DB. El "ahora" se inyecta.

/** Un encuentro que estaba agendado con alguien. */
export interface EncuentroPasado {
  personId: string
  personName: string
  /** 'YYYY-MM-DD' del evento. */
  date: string
  title: string
}

/** Registro de interacción ya existente (para no volver a preguntar). */
export interface RegistroExistente {
  personId: string
  /** ISO del momento en que se registró. */
  loggedAt: string
}

export interface PedidoDeRegistro {
  personId: string
  personName: string
  date: string
  title: string
  /** Días desde el encuentro (0 = hoy, 1 = ayer). */
  dias: number
}

const DAY = 86_400_000
/** Cuántos días atrás se sigue preguntando. Más allá, el recuerdo ya se diluyó. */
export const VENTANA_DIAS = 3

function dias(desde: string, hoy: string): number | null {
  const a = Date.parse(`${desde}T00:00:00Z`)
  const b = Date.parse(`${hoy}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round((b - a) / DAY)
}

/**
 * El encuentro más reciente que ya pasó y NO tiene registro. PURO. null si no hay.
 *
 * "No tiene registro" = no existe un `person_log` de esa persona con fecha IGUAL O
 * POSTERIOR al día del encuentro. Si registró algo después, ya contó cómo fue.
 *
 * El encuentro de HOY no se pregunta si todavía no terminó — pero eso no se puede
 * saber desde acá (la hora vive en la nota), así que el día 0 se excluye: preguntar
 * "¿cómo fue?" por la mañana sobre algo de la tarde es peor que no preguntar.
 */
export function pedidoDeRegistroPendiente(
  encuentros: readonly EncuentroPasado[],
  registros: readonly RegistroExistente[],
  hoy: string,
): PedidoDeRegistro | null {
  const candidatos: PedidoDeRegistro[] = []
  for (const e of encuentros ?? []) {
    if (!e?.personId || !e?.date) continue
    const d = dias(e.date, hoy)
    // d >= 1: ayer o antes. El de hoy todavía puede no haber ocurrido.
    if (d === null || d < 1 || d > VENTANA_DIAS) continue
    const yaRegistrado = (registros ?? []).some((r) =>
      r.personId === e.personId && String(r.loggedAt).slice(0, 10) >= e.date)
    if (yaRegistrado) continue
    candidatos.push({ personId: e.personId, personName: e.personName, date: e.date, title: e.title, dias: d })
  }
  if (candidatos.length === 0) return null
  // El más reciente: es el que mejor recuerda.
  candidatos.sort((a, b) => a.dias - b.dias)
  return candidatos[0]
}

/** "ayer" | "anteayer" | "hace N días". PURA. */
export function cuando(dias: number): string {
  if (dias === 1) return 'ayer'
  if (dias === 2) return 'anteayer'
  return `hace ${dias} días`
}

/**
 * La línea del brief. null si no hay nada que preguntar. PURA.
 *
 * Se formula como PREGUNTA ABIERTA y corta. No dice "califica del 1 al 5" — eso lo
 * resuelven los botones. Y no presupone cómo estuvo: *"¿cómo te fue?"*, nunca
 * *"¿mejoró?"*, porque la pregunta que insinúa una respuesta contamina el registro.
 */
export function pedidoDeRegistroLine(p: PedidoDeRegistro | null | undefined): string | null {
  if (!p) return null
  const primer = (p.personName ?? '').trim().split(/\s+/)[0] || 'esa persona'
  return `📝 ${cuando(p.dias)} tenías "${p.title.slice(0, 60)}" con ${primer}. ¿Cómo te fue? (un toque y lo anoto)`
}

/** Las 5 caritas, igual que el panel de la ficha. PURAS. */
export const CARITAS: ReadonlyArray<{ valor: 1 | 2 | 3 | 4 | 5; emoji: string }> = [
  { valor: 1, emoji: '💔' },
  { valor: 2, emoji: '🙁' },
  { valor: 3, emoji: '😐' },
  { valor: 4, emoji: '🙂' },
  { valor: 5, emoji: '💚' },
]

/** `ref` del botón: persona + valor, dentro de los 64 bytes de Telegram. PURA. */
export function refDeCarita(personId: string, valor: number): string {
  return `${personId}:${valor}`
}

/** Parsea la `ref`. PURA. null si viene mal. */
export function parseRefDeCarita(ref: string): { personId: string; valor: number } | null {
  const i = (ref ?? '').lastIndexOf(':')
  if (i <= 0) return null
  const valor = Number(ref.slice(i + 1))
  if (!Number.isInteger(valor) || valor < 1 || valor > 5) return null
  return { personId: ref.slice(0, i), valor }
}
