// SIR V2 — DETECTOR DE OPORTUNIDADES sobre las conversaciones reales.
//
// POR QUÉ EXISTE (fallo de producto, 28-jul-2026). Aaron:
//
//   "me preocupa que de alguna forma no hayamos leído la conversación con Dayana
//    y visto cómo se ha venido enfriando el tema de Boticas Jhodaal, y en
//    paralelo se haya estado creando una ventana de oportunidad con Miluska y no
//    hayamos hecho nada al respecto, y ni siquiera haya aparecido como
//    oportunidad, lead..."
//
// Tenía razón, y la causa no era el modelo: **esto no estaba construido.** SIR
// leía los chats para tres cosas —búsqueda cuando se le pregunta, léxico de
// afecto, y tensión relacional— y para NADA comercial. Medido ese día: 6.960
// mensajes con Miluska, 2.405 con Dayana, y en `deals` solo dos licitaciones de
// minería. El trabajo comercial real de Aaron no existía en el pipeline, así que
// no había nada que se pudiera enfriar ni avisar.
//
// QUÉ HACE, y qué NO:
//   - Detecta pedidos ENTRANTES con pinta comercial (cotización, precio,
//     presupuesto, "puedes hacerme") de gente que NO tiene un deal abierto →
//     "posible oportunidad sin registrar".
//   - Detecta hilos que TUVIERON señal comercial y se apagaron → "enfriamiento".
//   - NO decide nada solo: propone, y Aaron confirma. Un falso positivo cuesta
//     una línea en el brief; un falso negativo cuesta un cliente.
//
// DISEÑO: el enfriamiento se juzga sobre todo por SILENCIO (estructural), no por
// léxico. Buscar la frase exacta que dijo Dayana ("la están subiendo por partes")
// sería sobreajustar a un caso; el silencio después de una señal comercial es la
// regla general que sí generaliza.
//
// ARQUITECTURA — DOS ETAPAS, y la primera versión falló por no tenerlas:
//
//   Etapa 1 (este archivo, PURO y barato): lexicón de ALTO RECALL sobre todos los
//   mensajes. Produce CANDIDATOS, no veredictos.
//   Etapa 2 (`judge.ts`): un LLM barato juzga esos pocos candidatos.
//
// Por qué. Medido contra la data real de Aaron el 28-jul: con el lexicón amplio
// salieron 11 señales y solo ~4 eran reales (36%), y la #1 era su prima
// preguntando por SU contrato de trabajo. Al apretar el lexicón para que decidiera
// solo, bajó a 2 señales y **las dos falsas**, perdiendo las 4 buenas. Precisión 0.
//
// La razón de fondo: las señales que importaban eran «firmamos contrato o cómo
// empezamos?» y «voy con la oportunidad y me interesa bastante». Eso es SEMÁNTICO.
// Ninguna regex lo separa de «no me puedes hacer un favor» (su mamá) sin perderlo.
// Mismo patrón que `deepSearch` (#967) ya usa en este repo: barato para generar,
// modelo para decidir.
//
// PURO: cero red, cero IA, cero Date.now() implícito. Barato a propósito —
// corre sobre cientos de miles de mensajes sin llamar a ningún modelo.

/** Mensaje de un hilo, ya normalizado por el caller. */
export interface ThreadMessage {
  sentAt: string
  /** true = lo escribió Aaron. Solo los ENTRANTES cuentan como pedido. */
  fromMe: boolean
  text: string
}

export interface PersonThread {
  personId: string
  personName: string
  /** `people.relationship` (family, pareja, friend, professional…). Se usa para
   *  NO buscar oportunidades comerciales donde no las hay: la mamá de Aaron
   *  pidiéndole un favor no es un lead. Ausente = se escanea igual. */
  relationship?: string | null
  messages: ThreadMessage[]
}

/** Vínculos donde un "pedido" es un favor o un tema personal, no una venta.
 *  Excluirlos fue el filtro que más ruido sacó al calibrar contra data real. */
const NON_COMMERCIAL_RELATIONSHIPS = new Set([
  'family', 'familia', 'pareja', 'partner', 'novia', 'esposa', 'madre', 'padre', 'hermana', 'hermano',
])

export function isCommercialCandidate(relationship: string | null | undefined): boolean {
  if (!relationship) return true
  return !NON_COMMERCIAL_RELATIONSHIPS.has(relationship.trim().toLowerCase())
}

/** Deal ya registrado, para no proponer lo que ya está en el pipeline. */
export interface KnownDeal {
  contactPersonId: string | null
  status: string
}

export type OpportunityKind = 'oportunidad_sin_registrar' | 'enfriamiento'

export interface OpportunitySignal {
  kind: OpportunityKind
  personId: string
  personName: string
  /** La frase textual que disparó la señal. Va SIEMPRE: Aaron tiene que poder
   *  juzgar el dato, no confiar en el veredicto (regla de honestidad del repo). */
  quote: string
  quoteAt: string
  /** Palabras que hicieron match — para poder decir CON QUÉ se buscó. */
  matched: string[]
  daysSinceQuote: number
  /** Días desde el último mensaje del hilo (de cualquiera de los dos). */
  daysSinceLast: number
  confidence: 'alta' | 'media'
  text: string
}

/**
 * Pedido entrante con pinta comercial. Español peruano de WhatsApp.
 *
 * Los patrones se comparan contra el texto NORMALIZADO (minúsculas y sin tildes,
 * ver `normalize`) → se escriben en ASCII plano. Pelear con acentos dentro de cada
 * regex era la fuente del primer bug: `me cotizas` no matcheaba `cotiza(r|me)?\b`
 * porque la `s` rompía el `\b`, y `cotízame` no matcheaba `cotiz` porque la `í` no
 * es `\w`. Normalizar una vez y usar raíces (`cotiz\w*`) cubre toda la conjugación.
 */
// CALIBRADO contra la data real de Aaron (28-jul). La primera versión daba ~36%
// de precisión: 11 señales, 4 reales. Lo que la ensuciaba:
//   - `contratar` suelto cazaba a Amira preguntando por SU contrato de trabajo.
//   - `me puedes hacer` cazaba a su mamá pidiéndole un FAVOR.
//   - `precio` / `factur\w*` / `me interesa` sueltos cazaban charla interna y chisme.
// La corrección de fondo: un pedido comercial tiene DIRECCIÓN — el otro le pide a
// Aaron que HAGA algo. Solo cuenta como fuerte (a) un sustantivo comercial
// inequívoco, o (b) verbo en 2ª persona + objeto en 1ª ("me cotizas", "pasame la
// propuesta"). Lo demás queda débil y NO va al brief.
const INTENT_PATTERNS: Array<{ re: RegExp; label: string; strong: boolean }> = [
  // (a) Sustantivos que solo existen en contexto comercial.
  { re: /\bcotizacion\w*/, label: 'cotización', strong: true },
  { re: /\bpresupuest\w*/, label: 'presupuesto', strong: true },
  { re: /\bproforma\b/, label: 'proforma', strong: true },

  // (b) Verbo dirigido a Aaron + objeto en 1ª persona.
  { re: /\b(me|nos)\s+cotiz\w+/, label: 'me cotizas', strong: true },
  { re: /\bcotiza(me|nos)\b/, label: 'cotízame', strong: true },
  { re: /\b(me|nos)\s+(puedes|podrias|podes)\s+(cotizar|presupuestar|hacer\s+(una|el|la)\s+(propuesta|cotizacion|web|landing|pagina))\b/, label: 'me puedes cotizar', strong: true },
  { re: /\b(me|nos)\s+(pasas|mandas|envias|das)\s+(una|el|la|tu)?\s*(propuesta|cotizacion|presupuesto|proforma|precio\w*|tarifa\w*)\b/, label: 'me pasas la propuesta', strong: true },
  { re: /\bcuanto\s+(me\s+)?(sale|cuesta|cobras|saldria|costaria|seria)\b/, label: 'cuánto sale', strong: true },
  { re: /\bquiero\s+que\s+(me|nos)\s+(hagas|armes|disenes|cotices)\b/, label: 'quiero que me hagas', strong: true },
  { re: /\bnecesito\s+que\s+(me|nos)\s+(hagas|armes|disenes|cotices)\b/, label: 'necesito que me hagas', strong: true },

  // DÉBILES = generan candidato igual (el juez decide), pero con confianza media.
  // Son las que solas daban chisme y charla interna: se conservan porque en un
  // esquema de dos etapas perder recall acá es perder la oportunidad para siempre,
  // mientras que un falso positivo solo le cuesta un token al juez.
  { re: /\bcotiz\w*/, label: 'cotizar', strong: false },
  { re: /\bpropuesta\b/, label: 'propuesta', strong: false },
  { re: /\bprecio(s)?\b/, label: 'precio', strong: false },
  { re: /\btarifa(s)?\b/, label: 'tarifa', strong: false },
  { re: /\bme\s+interesa\b/, label: 'me interesa', strong: false },
  { re: /\bfactur\w*/, label: 'facturar', strong: false },
  // `contrato`/`contratos` (sustantivo) va incluido a propósito: sacarlo al
  // apretar el lexicón perdió «firmamos contrato o cómo empezamos?», que era el
  // candidato más prometedor de la corrida real. En dos etapas, perder recall acá
  // pierde la oportunidad para siempre.
  { re: /\bcontrat(ar|arte|arlo|amos|o|os|aria)\b/, label: 'contrato', strong: false },
  { re: /\b(firmamos|arrancamos|empezamos|comenzamos)\b/, label: 'firmamos/empezamos', strong: false },
]

/** Minúsculas y sin tildes: "Cotízame" → "cotizame". Así los patrones se
 *  escriben una sola vez, en ASCII, y cubren toda la conjugación. */
function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Días de silencio tras una señal comercial para llamarlo enfriamiento. */
export const COOLING_DAYS = 10
/** Ventana hacia atrás que se mira. Más allá ya no es "una ventana que se abre". */
export const LOOKBACK_DAYS = 90
/** Un pedido más viejo que esto ya no se propone como oportunidad fresca. */
export const FRESH_DAYS = 45

const DAY = 86_400_000

function daysBetween(fromISO: string, to: Date): number {
  const t = Date.parse(fromISO)
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY
  return Math.floor((to.getTime() - t) / DAY)
}

/** Recorta una cita para el brief sin cortar a mitad de palabra. */
function snippet(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return clean.slice(0, clean.lastIndexOf(' ', max) > 40 ? clean.lastIndexOf(' ', max) : max) + '…'
}

/** ¿Este texto entrante pide algo comercial? Devuelve las etiquetas que matchearon. */
export function commercialIntent(text: string): { matched: string[]; strong: boolean } {
  const clean = (text || '').trim()
  // Los adjuntos y los blobs base64 del import no son texto útil.
  if (!clean || clean.length < 8 || /^\[media\]$/i.test(clean) || /^[A-Za-z0-9+/=]{80,}$/.test(clean)) {
    return { matched: [], strong: false }
  }
  const norm = normalize(clean)
  const matched: string[] = []
  let strong = false
  for (const p of INTENT_PATTERNS) {
    if (p.re.test(norm)) {
      matched.push(p.label)
      if (p.strong) strong = true
    }
  }
  return { matched, strong }
}

/**
 * Detecta señales comerciales en los hilos. Devuelve como máximo una señal por
 * persona (la más relevante), ordenadas por urgencia.
 *
 * `deals` se usa para NO proponer lo que ya está en el pipeline: si la persona ya
 * tiene un deal abierto, su enfriamiento lo maneja el detector de deals que ya
 * existe (`detectDealGap`) y duplicarlo sería ruido.
 */
export function detectOpportunitySignals(
  threads: PersonThread[],
  deals: KnownDeal[],
  now: Date = new Date(),
): OpportunitySignal[] {
  const conDealAbierto = new Set(
    deals.filter((d) => d.status === 'open' && d.contactPersonId).map((d) => d.contactPersonId as string),
  )

  const out: OpportunitySignal[] = []

  for (const th of threads) {
    if (conDealAbierto.has(th.personId)) continue
    if (!isCommercialCandidate(th.relationship)) continue
    if (th.messages.length === 0) continue

    const enVentana = th.messages.filter((m) => daysBetween(m.sentAt, now) <= LOOKBACK_DAYS)
    if (enVentana.length === 0) continue

    // Último mensaje del hilo (de cualquiera) → mide el silencio.
    const ultimo = enVentana.reduce((a, b) => (a.sentAt > b.sentAt ? a : b))
    const daysSinceLast = daysBetween(ultimo.sentAt, now)

    // Pedido entrante con pinta comercial MÁS RECIENTE.
    let hit: { m: ThreadMessage; matched: string[]; strong: boolean } | null = null
    for (const m of enVentana) {
      if (m.fromMe) continue
      const { matched, strong } = commercialIntent(m.text)
      // El lexicón es un PRE-FILTRO de alto recall, no el veredicto: pasa todo lo
      // que huele a comercial y el juez (ver `judge.ts`) decide. Apretar el
      // lexicón para que decidiera solo bajó la precisión a 0 (ver cabecera).
      if (matched.length === 0) continue
      if (!hit || m.sentAt > hit.m.sentAt) hit = { m, matched, strong }
    }
    if (!hit) continue

    const daysSinceQuote = daysBetween(hit.m.sentAt, now)
    const cita = snippet(hit.m.text)
    const conQue = hit.matched.slice(0, 3).join(', ')

    if (daysSinceLast >= COOLING_DAYS) {
      // Hubo pedido comercial y el hilo se apagó. Lo que le pasó a Boticas.
      out.push({
        kind: 'enfriamiento',
        personId: th.personId,
        personName: th.personName,
        quote: cita,
        quoteAt: hit.m.sentAt,
        matched: hit.matched,
        daysSinceQuote,
        daysSinceLast,
        confidence: hit.strong ? 'alta' : 'media',
        text: `Se está enfriando con ${th.personName}: hace ${daysSinceLast} días que no se escriben y quedó un pedido sin cerrar — «${cita}» (${hit.m.sentAt.slice(0, 10)}). Lo vi por las palabras: ${conQue}.`,
      })
      continue
    }

    if (daysSinceQuote <= FRESH_DAYS) {
      // Pedido fresco y sin deal: la ventana de Miluska.
      out.push({
        kind: 'oportunidad_sin_registrar',
        personId: th.personId,
        personName: th.personName,
        quote: cita,
        quoteAt: hit.m.sentAt,
        matched: hit.matched,
        daysSinceQuote,
        daysSinceLast,
        confidence: hit.strong ? 'alta' : 'media',
        text: `Posible oportunidad sin registrar con ${th.personName}: te pidió algo y no está como deal — «${cita}» (${hit.m.sentAt.slice(0, 10)}, hace ${daysSinceQuote} día(s)). Lo vi por las palabras: ${conQue}. ¿La registro?`,
      })
    }
  }

  // Primero lo fresco y fuerte; después lo que se enfría hace más tiempo.
  const peso = (s: OpportunitySignal) =>
    (s.kind === 'oportunidad_sin_registrar' ? 0 : 1000) +
    (s.confidence === 'alta' ? 0 : 100) +
    (s.kind === 'oportunidad_sin_registrar' ? s.daysSinceQuote : -s.daysSinceLast)
  return out.sort((a, b) => peso(a) - peso(b))
}

/**
 * Línea para el brief: la señal MÁS relevante, con la cobertura declarada.
 *
 * Nunca dice "no hay oportunidades" — con `[]` devuelve null y el slot no
 * aparece. Es la regla dura del repo: no concluir ausencia desde una ventana
 * parcial (acá se miran los últimos `LOOKBACK_DAYS` días y solo por palabras).
 */
export function opportunityBriefLine(signals: OpportunitySignal[]): string | null {
  if (signals.length === 0) return null
  const top = signals[0]
  const otras = signals.length - 1
  const cola = otras > 0 ? ` (+${otras} señal(es) comercial(es) más para revisar)` : ''
  const icono = top.kind === 'oportunidad_sin_registrar' ? '💼' : '🧊'
  return `${icono} ${top.text}${cola}`
}
