// SIR V2 — Qué hacer con una foto que llega por Telegram. PURO.
//
// ═══ POR QUÉ EXISTE ═══════════════════════════════════════════════════════════
//
// Aaron, 2-ago-2026: *"hay cosas que le envié a SIR por Telegram y no pudo
// identificar"*.
//
// El webhook mandaba TODA foto al detector de stories sociales y hacía `return`.
// Si no era una story de IG ni un perfil de LinkedIn, respondía *"Vi la imagen,
// pero no parece una story/perfil…"* y **la descartaba**: no guardaba la imagen,
// no creaba observación, y ni siquiera dejaba rastro en `sir_messages`. Una foto
// de un documento, de un examen, de la báscula o de una tarjeta de contacto se
// perdía sin huella.
//
// Lo grave no es que no supiera clasificarla. Es que **no saber = tirar**.
//
// ═══ LA REGLA ═════════════════════════════════════════════════════════════════
//
// **Nada de lo que Aaron manda se descarta.** Si no se entiende qué es, se guarda
// igual con el texto que se le pueda sacar y se marca para revisar. Una captura
// mal clasificada se corrige; una descartada no se recupera — y él ni se entera
// de que la perdió, que es lo peor.
//
// PURO: cero red. Arma el prompt y interpreta la respuesta; el caller hace la
// llamada de visión y la escritura.

/** Los tipos a los que se puede rutear una foto suelta de Telegram. */
export type TipoFoto =
  | 'scale'             // pantalla de la báscula
  | 'sleep_panel'       // panel de sueño del reloj
  | 'heart_rate_panel'  // panel de frecuencia cardíaca
  | 'hrv_panel'         // panel de VFC
  | 'dm_conversation'   // captura de un chat
  | 'manual_note'       // documento, examen, nota escrita, tarjeta, cartel…
  | 'unknown'           // no se pudo decidir

export interface FotoClasificada {
  tipo: TipoFoto
  /** Todo el texto legible de la imagen. Es lo que de verdad alimenta a SIR. */
  texto: string
  /** Una línea de qué es, para responderle en el chat. */
  resumen: string
}

/**
 * El prompt de visión. Pide clasificar Y transcribir en UNA sola llamada.
 *
 * Se le exige que transcriba SIEMPRE, incluso cuando no sabe qué es: el texto es
 * lo que se puede rescatar aunque la clasificación falle, y es lo que evita que
 * la foto se convierta en un archivo mudo.
 */
export const CLASIFICAR_FOTO_PROMPT = `Eres el clasificador de imágenes de SIR, el sistema personal de Aaron.
Te llega una foto que él mandó por Telegram sin decir qué es. Tu trabajo es
decidir qué tipo de captura es y transcribir TODO el texto legible.

Responde SOLO un JSON, sin markdown y sin prosa:

{
  "tipo": "scale" | "sleep_panel" | "heart_rate_panel" | "hrv_panel" | "dm_conversation" | "manual_note" | "unknown",
  "texto": "<TODO el texto legible de la imagen, en orden de lectura>",
  "resumen": "<una línea, máx 120 caracteres, de qué es>"
}

Los tipos:
- "scale": pantalla de una báscula inteligente (peso, % de grasa, masa muscular, IMC…).
- "sleep_panel": panel de sueño de un reloj o app (horas, fases, puntaje).
- "heart_rate_panel": panel de frecuencia cardíaca (ppm, mín/máx, reposo).
- "hrv_panel": panel de variabilidad de la frecuencia cardíaca (VFC / HRV, en ms).
- "dm_conversation": captura de una conversación (WhatsApp, Instagram, Telegram, mail).
- "manual_note": CUALQUIER documento u objeto con texto — un examen de laboratorio,
  una receta, una tarjeta de contacto, un cartel, un contrato, una nota escrita a
  mano, una factura, una pantalla de una app que no sea de las de arriba.
- "unknown": SOLO si de verdad no hay nada interpretable (una foto de un paisaje,
  una selfie, algo borroso sin texto).

Reglas duras:
1. "texto" es OBLIGATORIO y se llena SIEMPRE, aunque el tipo sea "unknown". Si no
   hay texto legible, pon "" y descríbelo en "resumen".
2. NO inventes nada. Si un número no se lee bien, no lo adivines: omítelo.
3. Ante la duda entre un tipo específico y "manual_note", elige "manual_note":
   se guarda igual y con el texto completo, que es lo que importa.
4. Escribe el resumen en español del Perú, tuteo con "tú". Nada de voseo.`

const TIPOS: ReadonlySet<string> = new Set<TipoFoto>([
  'scale', 'sleep_panel', 'heart_rate_panel', 'hrv_panel', 'dm_conversation', 'manual_note', 'unknown',
])

/**
 * Interpreta la respuesta del modelo. PURA. NUNCA devuelve null.
 *
 * Ese "nunca null" es el punto entero del módulo: si el JSON viene roto, se
 * devuelve `unknown` con el texto crudo como respaldo, para que el caller igual
 * tenga algo que guardar. Devolver null habría reproducido el bug original —
 * un fallo de parseo terminando en una foto tirada.
 */
export function parseFotoClasificada(raw: string): FotoClasificada {
  const crudo = (raw ?? '').trim()
  const fallback = (texto: string): FotoClasificada =>
    ({ tipo: 'unknown', texto: texto.slice(0, 8000), resumen: 'No pude clasificarla, pero la guardé' })

  const abre = crudo.indexOf('{')
  const cierra = crudo.lastIndexOf('}')
  if (abre < 0 || cierra <= abre) return fallback(crudo)

  let obj: Record<string, unknown>
  try { obj = JSON.parse(crudo.slice(abre, cierra + 1)) as Record<string, unknown> }
  catch { return fallback(crudo) }

  const tipo = typeof obj.tipo === 'string' && TIPOS.has(obj.tipo) ? obj.tipo as TipoFoto : 'unknown'
  const texto = typeof obj.texto === 'string' ? obj.texto.slice(0, 8000) : ''
  const resumen = typeof obj.resumen === 'string' && obj.resumen.trim()
    ? obj.resumen.trim().slice(0, 120)
    : 'Imagen guardada'
  return { tipo, texto, resumen }
}

/** ¿Hay que mirarla a mano? PURA. */
export function necesitaRevision(f: FotoClasificada): boolean {
  return f.tipo === 'unknown' || f.texto.trim().length === 0
}

/**
 * Lo que SIR le responde en Telegram. PURA.
 *
 * Dice SIEMPRE que quedó guardada. La respuesta vieja ("no parece una story…")
 * era literalmente cierta y completamente inútil: no le decía qué hacer ni que
 * acababa de perder lo que mandó.
 */
export function respuestaDeFoto(f: FotoClasificada): string {
  const ETIQUETA: Record<TipoFoto, string> = {
    scale: 'una captura de la báscula',
    sleep_panel: 'tu panel de sueño',
    heart_rate_panel: 'tu panel de frecuencia cardíaca',
    hrv_panel: 'tu panel de VFC',
    dm_conversation: 'una conversación',
    manual_note: 'un documento o nota',
    unknown: 'algo que no supe clasificar',
  }
  if (f.tipo === 'unknown') {
    const conTexto = f.texto.trim().length > 0
    return conTexto
      ? `📎 Guardado. No supe qué tipo de captura es, pero le saqué el texto y lo dejé anotado para revisarlo. Si me dices qué es, lo clasifico.`
      : `📎 Guardado, pero no le pude sacar texto. ¿Qué es? Con eso lo anoto bien.`
  }
  return `📎 Guardado: ${ETIQUETA[f.tipo]}. ${f.resumen}`
}
