// SIR V2 — EL léxico de organizaciones. Uno solo, a propósito.
//
// POR QUÉ EXISTE (29-jul-2026): había DOS listas de palabras que delatan una
// organización —`ORG_LEXICON` en entityKind.ts (para el nombre) y
// `PISTAS_NEGOCIO` en handleSuggest.ts (para el handle)— y se separaron. La del
// handle nunca recibió 'airguns', 'uniformes', 'club', 'comunidad' ni 'diario',
// así que @impalaairguns, @johnholdenuniformes, @clubdecaballeros, @comunidadtls y
// @diarioelprofeta pasaban como personas aunque la OTRA lista sí tenía la palabra.
//
// Es el mismo error que el hash duplicado de chat_messages del mismo día: dos
// copias de la misma verdad siempre se separan, y la única defensa es que haya
// una sola. Medido sobre las 103 cuentas reales de la bandeja: la lista del handle
// marcaba 27; con el léxico unificado sube a 60 sin inventar falsos positivos.
//
// PURO y sin dependencias.

/**
 * Pistas FUERTES: dicen el rubro o la razón social. Si una de estas aparece, la
 * cuenta es una organización con alta probabilidad.
 */
export const PISTAS_FUERTES = [
  // Estructura legal / societaria
  // 'sa' NO está a propósito: con dos letras, "termina en sa" pesca medio nombre
  // español (Rosa, Teresa, Elisa) y arruinaría la precisión de toda la lista.
  'sac', 'srl', 'eirl', 'corporacion', 'corp', 'grupo', 'empresa', 'compania', 'compañia',
  // Colectivos
  'club', 'asociacion', 'comunidad', 'federacion', 'confederacion', 'liga', 'gremio',
  'brigada', 'unidad', 'bomberos', 'bombero',
  // Eventos
  'juegos', 'campeonato', 'torneo', 'copa', 'congreso', 'feria', 'expo',
  // Comercio
  'bazar', 'market', 'tienda', 'store', 'shop', 'boutique', 'distribuidora',
  'importaciones', 'comercial', 'ventas', 'maquila',
  // Educación
  'centro', 'instituto', 'institution', 'academia', 'academy', 'escuela', 'colegio', 'universidad',
  // Salud
  'clinica', 'botica', 'farmacia', 'hospital', 'policlinico', 'dental', 'medical', 'vitamedical',
  // Comida
  'restaurante', 'restaurant', 'cafe', 'pizzeria', 'pizza', 'delivery', 'gourmet',
  // Estado / fuerzas
  'fuerza aerea', 'fuerzaaerea', 'ejercito', 'marina', 'policia', 'municipalidad', 'ministerio',
  // Deporte y outdoor
  'airguns', 'guns', 'armeria', 'archery', 'airsoft', 'tactical', 'gear', 'gym',
  'fitness', 'crossfit', 'sport', 'mma',
  // Servicios profesionales
  'inmobiliaria', 'constructora', 'contratistas', 'ingenieria', 'consultora', 'consultoria',
  'abogados', 'legal', 'estudio', 'studio', 'agencia', 'outsourcing', 'seguros',
  'inversiones', 'investors', 'servicios', 'soluciones', 'uniformes',
  // Seguridad y técnica
  'seguridad', 'security', 'safety', 'buceo', 'electronico', 'plastic',
  // Tech y medios
  'software', 'tech', 'digital', 'diario', 'revista', 'radio', 'productora', 'salon', 'spa', 'barber',
]

/**
 * Pistas GEOGRÁFICAS. Son fuertes, pero SOLO como sufijo: la posición es la que
 * decide. Un handle que TERMINA en "peru" es un nombre comercial —@cablemundoperu,
 * @creotvperu, @fireaxperu—; una palabra que EMPIEZA con "peru" y sigue con otra
 * cosa no dice nada de la cuenta: "peruanista" es un gentilicio ideológico, no una
 * razón social, y @peruanista_conservador es una página de opinión.
 *
 * Por eso van aparte y se exigen en borde (el token ES la pista o TERMINA en ella),
 * en vez de valer como subcadena.
 */
export const PISTAS_GEO = ['peru', 'lima', 'latam']

/**
 * Pistas DÉBILES: sugieren cuenta pública, pero las usan igual las personas.
 * 'oficial' es el caso claro — @mastermunozoficial es la cuenta oficial de una
 * PERSONA, no una empresa. Estas no alcanzan para proponer "es una organización";
 * solo para no afirmar que es un contacto personal.
 */
export const PISTAS_DEBILES = ['oficial', 'official', 'premium']

function norm(s: string): string {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

/** Parte un handle en sus piezas, sin los dígitos del final ("expoispperu1" → "expoispperu"). */
export function tokensDeHandle(handle: string): string[] {
  return norm(handle).replace(/^@/, '')
    .split(/[._\-\s]+/)
    .map((t) => t.replace(/\d+$/, ''))
    .filter(Boolean)
}

/**
 * ¿La pista aparece de forma CREÍBLE en el handle?
 *
 * Una pista corta metida en medio de una palabra no dice nada: "spa" dentro de
 * "fra·spa·ravencedor" marcaba @frasesparavencedor como negocio, el mismo error de
 * subcadena que hizo pasar "@giancarlopostigo" por "Carlo". La regla:
 *
 *  · pista de 4+ letras → vale como subcadena ("consultora" en "consultorabc",
 *    "tech" en "braintechperu", "corp" en "corporacionaxion").
 *  · pista de 3 o menos (spa, gym, sac, srl, mma) → solo si el token ES la pista o
 *    TERMINA en ella.
 *
 * El "termina en" es lo que separa @cablemundoperu (organización) de
 * @peruanista_conservador: los dos contienen "peru", pero solo el primero lo tiene
 * como sufijo. "peruanista" empieza con "peru" y sigue con otra palabra distinta.
 */
export function pistaCreible(handle: string, pista: string): boolean {
  const p = norm(pista)
  const tokens = tokensDeHandle(handle)
  if (tokens.some((t) => t === p || t.endsWith(p))) return true
  return p.length >= 4 && tokens.some((t) => t.includes(p))
}

/** ¿El token ES la pista o TERMINA en ella? (sin la tolerancia de subcadena) */
function pistaEnBorde(handle: string, pista: string): boolean {
  const p = norm(pista)
  return tokensDeHandle(handle).some((t) => t === p || t.endsWith(p))
}

/** La primera pista fuerte del handle, o null. La geo solo cuenta como sufijo. */
export function pistaFuerteEnHandle(handle: string): string | null {
  return PISTAS_FUERTES.find((p) => pistaCreible(handle, p))
    ?? PISTAS_GEO.find((p) => pistaEnBorde(handle, p))
    ?? null
}

/** La primera pista débil del handle, o null. */
export function pistaDebilEnHandle(handle: string): string | null {
  return PISTAS_DEBILES.find((p) => pistaCreible(handle, p)) ?? null
}

/** La primera pista (de cualquier tier) dentro de un TEXTO libre — nombre o nota. */
export function pistaEnTexto(texto: string): string | null {
  const t = norm(texto)
  if (!t) return null
  return [...PISTAS_FUERTES, ...PISTAS_GEO, ...PISTAS_DEBILES].find((p) => t.includes(p)) ?? null
}
