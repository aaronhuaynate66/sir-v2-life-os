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

/**
 * Cuánto vale la pena mirar atrás.
 *
 * ═══ ERA DE 30 MINUTOS Y ESO NO ES CÓMO LLEGAN LAS RESPUESTAS ════════════════
 * La tarjeta la manda `evening-push` a las 21:00 de Lima. El 4-ago salió 21:23 y
 * Aaron respondió **a las 08:44 del día siguiente** — once horas después, que es
 * exactamente lo normal cuando el aviso llega de noche. Con 30 minutos, la única
 * respuesta que servía era la que él diera antes de dormirse.
 *
 * 48 h cubre "lo veo a la mañana" y "lo veo el finde" sin llegar a secuestrar un
 * mensaje de otra conversación: el riesgo real no lo acota el reloj sino
 * `pareceUnNombre`, que exige que el texto tenga forma de nombre propio.
 */
export const VENTANA_MINUTOS = 48 * 60

/** Marca inequívoca de la tarjeta de identidad (ver `buildIdentityCard`). */
const MARCA = /Vi una historia de @([a-zA-Z0-9._]{2,30})/i

/**
 * ¿El texto parece la RESPUESTA a "¿de quién es?" — o sea, un nombre? PURA.
 *
 * Conservador a propósito: si él estaba preguntando otra cosa, secuestrarle el
 * mensaje para crear una ficha sería peor que no hacer nada. Por eso se descarta
 * todo lo que parezca pregunta, orden o frase larga.
 */
/** Partículas que van en minúscula DENTRO de un nombre: "Juan de la Cruz". */
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'da', 'do', 'dos', 'van', 'von', 'di', 'le', "d'"])

/**
 * El nombre que hay al principio del texto, sin el contexto que venga después. PURA.
 *
 * La gente no responde "Piero López Quintana" a secas: responde **"Piero López
 * Quintana, es un amigo de colegio de secundaria"**. El nombre está antes de la coma
 * y lo de después es la explicación. Antes eso se rechazaba entero por largo.
 */
export function recorteDeNombre(texto: string): string {
  return (texto ?? '')
    .trim()
    .replace(/^(es|se llama|ella es|[eé]l es)\s+/i, '')
    // Corta en la coma o en el conector donde arranca la explicación.
    // OJO: `el`/`la` NO van acá aunque parezcan conectores — son partículas de
    // nombre y cortaban "Juan de la Cruz" en "Juan de".
    .split(/\s*[,;]\s*|\s+(?:que|es|era|un|una|mi)\s+/i)[0]
    .replace(/[.\s]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function pareceUnNombre(texto: string): boolean {
  const t = (texto ?? '').trim()
  // El TOPE va sobre el texto completo y es holgado: lo que se evalúa como nombre
  // es el recorte, no la frase. Antes 60 caracteres tumbaba una respuesta normal.
  if (t.length < 3 || t.length > 200) return false
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
  if (/\n/.test(t)) return false

  // ═══ SE JUZGA EL RECORTE, NO LA FRASE ══════════════════════════════════════
  //
  // Aaron, 5-ago-2026, respondiendo a la tarjeta de @pierolq:
  //   *"Piero López Quintana, es un amigo de colegio de secundaria"*
  // El tope viejo de 5 palabras la rechazaba (son 10) y su respuesta cayó al chat
  // genérico. Hizo todo bien y no quedó ni la ficha ni rastro del intento.
  //
  // Ahora se recorta el nombre y se juzga ESO. Lo que impide secuestrar un mensaje
  // de otra conversación ya no es el largo —que castigaba al que explica— sino la
  // FORMA: un nombre propio va capitalizado. "Pásame el informe, por favor" recorta
  // a "Pásame el informe" y cae por la minúscula de "informe".
  const candidato = recorteDeNombre(t)
  if (!candidato) return false
  const todas = candidato.split(/\s+/)
  if (todas.length === 0 || todas.length > 5) return false
  if (!todas.every((p) => /^[\p{L}'’.-]+$/u.test(p))) return false

  // Las partículas ("de", "la") no cuentan para juzgar: van en minúscula por regla.
  const sinParticulas = todas.filter((p, i) => !(i > 0 && PARTICULAS.has(p.toLowerCase())))
  const esMayus = (p: string) => p[0] === p[0].toUpperCase() && p[0] !== p[0].toLowerCase()
  if (sinParticulas.length === 1) return esMayus(sinParticulas[0])

  // Con dos o más: sirve que estén TODAS capitalizadas ("Piero López Quintana"), o
  // que haya alguna capitalizada que NO sea la primera ("es pedro Valera" — la gente
  // escribe el nombre de pila en minúscula y el apellido no).
  //
  // Exigir que TODAS lo estén rompía ese caso, que ya tenía test. Y aceptar con solo
  // la primera dejaría pasar "Pásame el informe": ahí la única mayúscula es la del
  // arranque de la frase, que no dice nada.
  return sinParticulas.every(esMayus) || sinParticulas.slice(1).some(esMayus)
}

/**
 * El nombre listo para guardar. PURA.
 *
 * Delega en `recorteDeNombre`, así que "Piero López Quintana, es un amigo de colegio"
 * guarda **"Piero López Quintana"** y no la frase entera. Antes esto solo quitaba el
 * prefijo, y el webhook además lo descartaba y usaba el texto crudo — de haber
 * enganchado, habría creado una persona llamada "Piero López Quintana, es un amigo
 * de colegio de secundaria".
 */
export function nombreLimpio(texto: string): string {
  return recorteDeNombre(texto)
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
