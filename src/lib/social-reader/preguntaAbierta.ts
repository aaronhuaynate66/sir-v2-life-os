// SIR V2 — Recuperar el @handle cuando Aaron NO usó el gesto de "responder". PURO.
//
// ═══ EL CASO, TEXTUAL ═════════════════════════════════════════════════════════
//
// 2-ago-2026, 22:54. SIR le manda la tarjeta: *"👀 Vi una historia de @pvalera24 y
// no sé de quién es… respóndeme a este mensaje con su nombre y le creo la ficha."*
//
// Aaron escribe **"Es pedro Valera"**. Hizo exactamente lo que le pidieron.
//
// Y no pasó nada: el flujo saca el handle del mensaje CITADO
// (`handleFromCaption` sobre `msg.replyTo`), y él no usó el gesto de responder de
// Telegram — escribió un mensaje normal. Con `replyTo` vacío no hay handle, el
// resolvedor de identidades no engancha, y el texto cae al chat general.
//
// Ahí pasó lo peor: SIR contestó *"Pedro Valera es el Dr. Campos Soto, el
// maxilofacial de SANNA"*. **Falso.** El contexto de su cita del 3-ago contaminó
// la respuesta. Aaron tuvo que corregirlo: *"no nada que ver, estás mezclando
// cosas"*. La ficha nunca se creó.
//
// ═══ POR QUÉ ESTE MÓDULO Y NO UNA TABLA DE ESTADO ═════════════════════════════
//
// El diseño original evitó guardar "última pregunta pendiente" a propósito, y con
// razón: un estado así se desincroniza. Esto respeta esa decisión — no guarda
// nada. Mira el HILO que ya existe (`sir_messages`) y pregunta: ¿el último
// mensaje del bot fue una tarjeta de identidad, y lo que él acaba de escribir
// parece un nombre?
//
// Es reconstruir el contexto de lo que ya está escrito, no inventar un estado nuevo.
//
// PURO: cero red, cero DB.

/** Cuánto vale la pena mirar atrás. Más de esto y ya está hablando de otra cosa. */
export const VENTANA_MINUTOS = 30

/** Marca inequívoca de la tarjeta de identidad (ver `buildIdentityCard`). */
const MARCA = /Vi una historia de @([a-zA-Z0-9._]{2,30})/i

/**
 * ¿El texto parece la RESPUESTA a "¿de quién es?" — o sea, un nombre? PURA.
 *
 * Conservador a propósito: si él estaba preguntando otra cosa, secuestrarle el
 * mensaje para crear una ficha sería peor que no hacer nada. Por eso se descarta
 * todo lo que parezca pregunta, orden o frase larga.
 */
export function pareceUnNombre(texto: string): boolean {
  const t = (texto ?? '').trim()
  if (t.length < 3 || t.length > 60) return false
  if (/[?¿]/.test(t)) return false
  // Interrogativos y verbos de pedido: "qué tengo mañana", "búscame a", "dime".
  //
  // Se compara SIN TILDES en vez de enumerar variantes: "busca" no matcheaba
  // "búscame", y listar cada forma acentuada es una lista blanca que se rompe con
  // la primera palabra nueva. Y la frontera va con lookahead, no con `\b`, porque
  // en JS `\b` se basa en `\w` y no reconoce la é — el mismo tropiezo ya
  // documentado en `lib/text/deVoseo`.
  const sinTildes = t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  if (/^\s*(que|como|cual|cuando|donde|quien|dime|busca|crea|arma|muestra|revisa|manda|escribe|anota|agrega)/u.test(sinTildes)) return false
  // Un nombre no tiene saltos de línea ni puntuación de frase.
  if (/\n/.test(t) || /[.;:!]{1}\s/.test(t)) return false
  // Tiene que traer al menos una palabra capitalizada o ser corto y limpio.
  const palabras = t.replace(/^(es|se llama|ella es|él es|el es)\s+/i, '').trim().split(/\s+/)
  if (palabras.length === 0 || palabras.length > 5) return false
  return palabras.every((p) => /^[\p{L}'’.-]+$/u.test(p))
}

/** Le quita el prefijo conversacional: "Es pedro Valera" → "pedro Valera". PURA. */
export function nombreLimpio(texto: string): string {
  return (texto ?? '').trim()
    .replace(/^(es|se llama|ella es|[eé]l es)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Una fila de `unmatched_social_activity` que ya se preguntó. */
export interface HandlePreguntado {
  handle: string
  /** ISO de cuándo se mandó la tarjeta (`asked_at`). */
  askedAt: string | null
}

/**
 * El @handle que quedó preguntado sin responder. PURO. null si no aplica.
 *
 * Se apoya en `asked_at`, que la app YA guarda al mandar la tarjeta — no en
 * parsear el hilo. Es el registro autoritativo de "qué preguntó y cuándo", y no
 * depende de que el mensaje se haya logueado.
 *
 * Condiciones, todas duras:
 *   1. lo que Aaron escribió parece un nombre y no otra cosa,
 *   2. hay un handle preguntado hace menos de `VENTANA_MINUTOS`,
 *   3. hay UNO SOLO en esa ventana.
 *
 * Lo tercero importa: si SIR preguntó por dos cuentas casi a la vez, un nombre
 * suelto es ambiguo y asignarlo al azar le ensuciaría el grafo. Ante la duda se
 * devuelve null y el mensaje sigue su camino normal — volver a preguntar cuesta
 * menos que crear una ficha equivocada.
 */
export function handlePendiente(
  preguntados: readonly HandlePreguntado[],
  textoDeAaron: string,
  ahora: Date,
): { handle: string; nombre: string } | null {
  if (!pareceUnNombre(textoDeAaron)) return null

  const enVentana = (preguntados ?? []).filter((p) => {
    if (!p?.handle || !p.askedAt) return false
    const t = Date.parse(p.askedAt)
    if (!Number.isFinite(t)) return false
    const min = (ahora.getTime() - t) / 60_000
    return min >= 0 && min <= VENTANA_MINUTOS
  })
  if (enVentana.length !== 1) return null

  const nombre = nombreLimpio(textoDeAaron)
  if (nombre.length < 3) return null
  return { handle: enVentana[0].handle.toLowerCase(), nombre }
}

/** ¿Este texto es la tarjeta de identidad? PURA. Para no re-loguearla dos veces. */
export function esTarjetaDeIdentidad(texto: string): boolean {
  return MARCA.test(texto ?? '')
}
