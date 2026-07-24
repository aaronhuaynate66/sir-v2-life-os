// SIR V2 — Scrubber DETERMINÍSTICO voseo/rioplatense → tuteo peruano.
//
// La regla anti-voseo del prompt es fuerte pero el modelo IGUAL se resbala (el
// harness de eval cazó "querés" en una respuesta real). Reforzar el prompt no
// garantiza nada; esto SÍ: se pasa sobre la salida del LLM antes de devolverla,
// así el voseo nunca llega a Aaron (chat web y Telegram). [[idioma-espanol-peru]]
//
// CONSERVADOR: solo formas INEQUÍVOCAS del voseo (conjugaciones -és/-ás de 2ª
// persona, sos, vos, imperativos rioplatenses). NO toca ambiguas ("dale", "acá",
// "allá") que en Perú también se usan — evita falsos positivos.

/** Pares [forma voseo, tuteo]. La clave se compila a regex con \b y flag gi. */
const REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  // Conjugaciones voseo (presente): -és / -ás
  ['tenés', 'tienes'], ['querés', 'quieres'], ['podés', 'puedes'], ['sabés', 'sabes'],
  ['hacés', 'haces'], ['decís', 'dices'], ['venís', 'vienes'], ['sentís', 'sientes'],
  ['vivís', 'vives'], ['ponés', 'pones'], ['salís', 'sales'], ['tenés que', 'tienes que'],
  ['creés', 'crees'], ['leés', 'lees'], ['vés', 'ves'], ['andás', 'andas'], ['estás vos', 'estás tú'],
  // Más presentes -és/-ás (el harness cazó "debés"). NO incluir "tomás" (choca con
  // el nombre Tomás); el imperativo "tomá" ya está cubierto más abajo.
  ['debés', 'debes'], ['necesitás', 'necesitas'], ['pensás', 'piensas'], ['hablás', 'hablas'],
  ['buscás', 'buscas'], ['llamás', 'llamas'], ['usás', 'usas'], ['trabajás', 'trabajas'],
  ['dejás', 'dejas'], ['mandás', 'mandas'], ['mirás', 'miras'], ['pasás', 'pasas'],
  ['quedás', 'quedas'], ['tratás', 'tratas'], ['entendés', 'entiendes'], ['respondés', 'respondes'],
  ['elegís', 'eliges'], ['seguís', 'sigues'], ['pedís', 'pides'], ['preferís', 'prefieres'],
  ['recibís', 'recibes'], ['conseguís', 'consigues'], ['escribís', 'escribes'],
  // Más -ís (el harness cazó "te referís"). Inequívocas, sin choque con nombres.
  ['referís', 'refieres'], ['sugerís', 'sugieres'], ['corregís', 'corriges'],
  ['repetís', 'repites'], ['servís', 'sirves'], ['medís', 'mides'], ['subís', 'subes'],
  ['definís', 'defines'], ['decidís', 'decides'], ['cumplís', 'cumples'], ['exigís', 'exiges'],
  // Ser
  ['sos', 'eres'],
  // Imperativos rioplatenses → tuteo peruano
  ['decime', 'dime'], ['contame', 'cuéntame'], ['mirá', 'mira'], ['fijate', 'fíjate'],
  ['ponete', 'ponte'], ['ponételo', 'póntelo'], ['escribile', 'escríbele'], ['mandale', 'mándale'],
  ['andá', 'anda'], ['dejá', 'deja'], ['tomá', 'toma'], ['esperá', 'espera'], ['pará', 'para'],
  ['vení', 'ven'], ['acordate', 'acuérdate'], ['quedate', 'quédate'], ['calmate', 'cálmate'],
  ['fijáte', 'fíjate'], ['dale que', 'vamos que'],
  // Pronombre
  ['vos', 'tú'],
]

/** Aplica la misma capitalización del original (primera letra) al reemplazo. */
function matchCase(original: string, replacement: string): string {
  if (original.length === 0) return replacement
  if (original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1)
  }
  return replacement
}

// Fronteras propias en vez de \b: en JS \b se basa en \w (sin acentos), así que
// "mirá " no tenía boundary tras "á". Los lookarounds excluyen letras acentuadas.
const LETTER = 'a-záéíóúüñ'
const COMPILED = REPLACEMENTS.map(([from, to]) =>
  [new RegExp(`(?<![${LETTER}])(?:${from.replace(/\s+/g, '\\s+')})(?![${LETTER}])`, 'gi'), to] as const,
)

/**
 * Reemplaza voseo/rioplatense por tuteo peruano en un texto. PURO. Preserva
 * mayúsculas de inicio. Idempotente (correr dos veces = una).
 */
export function deVoseo(text: string): string {
  if (!text) return text
  let out = text
  for (const [re, to] of COMPILED) {
    out = out.replace(re, (m) => matchCase(m, to))
  }
  return out
}
