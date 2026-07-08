// SIR V2 — Léxico español para las señales conductuales (§7-8 del spec). PURO.
//
// Cada categoría es una lista de regex. Un mensaje "puntúa" en una categoría si
// matchea ≥1. Sin LLM: barato, privado, determinístico. Ampliable por persona
// más adelante (feedback). NO es análisis clínico — son marcadores de superficie.

export type SignalCategory = 'pain' | 'medication' | 'health' | 'sleep' | 'friction' | 'withdrawal' | 'sensitivity' | 'actions'

export const LEXICON: Record<SignalCategory, RegExp[]> = {
  pain: [
    /\bme duele|dolor|duele\b/i,
    /\bmigra[ñn]a|jaqueca|c[oó]lico|retorcij|puntada|calambre/i,
    /\bdolor de (cabeza|barriga|panza|espalda|ovario|est[oó]mago)/i,
  ],
  medication: [
    /\bpastilla|analg[eé]sic|paracetamol|ibuprofen|naproxen|anaflex|apronax|panadol|dolofl|buscapin/i,
    /\btom[eé] (una|algo|la|un)\b|me tom[eé]|medicaci[oó]n|remedio|antiinflamator/i,
    /\bcompr[eé] (pastilla|toalla|ibuprofen|algo para)/i,
  ],
  health: [
    /\bestoy mal|me siento mal|me siento d[eé]bil|malestar|me enferm/i,
    /\bn[aá]usea|v[oó]mit|fiebre|mareo|descompuest|indispuest/i,
  ],
  sleep: [
    /\bsue[ñn]o|cansad[ao]|agotad[ao]|reventad[ao]|muerta de sue[ñn]o/i,
    /\bno dorm[ií]|dorm[ií] mal|desvel|no pegu[eé] ojo|sin energ[ií]a/i,
  ],
  friction: [
    /\bme molesta|molest[ao]|harta|hart[ao]|enojad[ao]|bronca|fastidi/i,
    /\bno me hables|d[eé]jame en paz|ya fue|basta|no jodas|me tiene cansad/i,
    /\best[uú]pid|idiota|imb[eé]cil|malditа?|odio cuando/i,
  ],
  withdrawal: [
    /\bno quiero hablar|no tengo ganas|despu[eé]s hablamos|luego hablamos|hablamos (luego|despu[eé]s|ma[ñn]ana)/i,
    /\bd[eé]jame|estoy ocupad|no puedo hablar|ando ocupad|ya me voy/i,
    /^\s*(ok|oka|okey|ya|chau|bueno|aj[aá]|mmm|nada)\s*\.?\s*$/i, // cierres secos
  ],
  sensitivity: [
    /\btriste|sensible|ando rara|me siento sola|bajone|deprim|vulnerable/i,
    /\bllor(ar|é|o|ando)|ansios[ao]|angustia|me siento (mal|rara|down)/i,
    /\bnecesito (hablar|un abrazo|apoyo)|ap[oó]yame|abr[aá]zame|te extra[ñn]o/i,
  ],
  actions: [
    /\bcompr[eé]|fui\b|no fui|sal[ií]|me qued[eé]|me acost[eé]|descans[eé]/i,
    /\btrabaj[eé]|estudi[eé]|com[ií]|almorc[eé]|cen[eé]|entren[eé]|camin[eé]/i,
  ],
}

/** ¿Cuántos regex de la categoría matchean el texto? (≥1 = puntúa la categoría). */
export function categoryHits(text: string, cat: SignalCategory): number {
  let n = 0
  for (const re of LEXICON[cat]) if (re.test(text)) n++
  return n
}
