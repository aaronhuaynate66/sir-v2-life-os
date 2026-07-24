// SIR V2 — Señal de AFECTO EXPRESADO por día (IAE, ver docs/research/indice-afecto-relacional.md).
//
// PURO, sin LLM. General: sirve para CUALQUIER persona (no solo pareja) — mide la
// DENSIDAD de expresiones afectivas/positivas en los mensajes, y un ratio de
// positividad al estilo Gottman. Es un DISPARADOR DE CONVERSACIÓN, no un veredicto:
// "afecto expresado ≠ afecto sentido" (Floyd, Postulado 2). Léxico peruano hecho a
// mano — donde vive la señal real (los léxicos académicos ES no tienen clase "cariño").
//
// Categorías (peso IAE Paso 1): E explícitas (3) · P apodos (2) · M emojis (1) ·
// O otras posemo/afiliación (0.5). N = marcadores negativos (para el ratio).

/** Quita tildes y baja a minúsculas (match robusto por inclusión). */
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// E — declaraciones explícitas de afecto (sin tildes, ya normalizadas).
const EXPLICIT: readonly RegExp[] = [
  /te amo|te quiero|te adoro|te extra[ñn]o|te re quiero|te amo mucho|te amo demasiado/,
  /amor de mi vida|eres mi (todo|vida)|no puedo (vivir )?sin ti|me haces feliz|eres lo mejor/,
]
// P — apodos / pet names peruanos.
const PETNAMES: readonly RegExp[] = [
  /\bmi amor\b|\bamorcit|\bmi vida\b|\bmi cielo\b|\bmi rey\b|\bmi reina\b|\bcorazon\b|\bcari[ñn]?it?o?\b/,
  /\bbeb[eé]?\b|\bbb\b|\bgordi|\bflaquit|\bnegrit|\bchiquit|\bprincesa|\bosit|\bmi ni[ñn][ao]\b|\bmi chiquit/,
]
// O — otras positivas / afiliación (contigo, juntos, extraño, gracias, besos…).
const OTHER_POS: readonly RegExp[] = [
  /\bcontigo\b|\bjunt[oa]s\b|\bextra[ñn]|\bgracias\b|\bcuidate\b|\bque descanses\b|\bbuenos dias\b|\bbuenas noches\b/,
  /\babrazo|\bbes(o|it)|\bme encanta|\bque lindo|\bque rico verte|\bfeliz (de|contigo)|\borgullos[ao] de ti/,
]
// N — marcadores negativos (para el ratio de positividad, no restan del afecto).
const NEGATIVE: readonly RegExp[] = [
  /\bodio\b|\bno me hables|\bd[eé]jame|\bhart[ao]|\bmolest|\benoj|\bpelea|\bdiscut|\bno quiero (hablar|verte)|\bya fue\b/,
  /\best[uú]pid|\bidiota|\bimb[eé]cil|\bme decepcion|\bme lastim|\bno me importa|\bhaz lo que quieras/,
]
// M — emojis de cariño. Se prueban sobre el texto CRUDO (no normalizado).
const AFFECTION_EMOJI =
  /[❤❣\u{1F970}\u{1F618}\u{1F60D}\u{1F495}\u{1F496}\u{1F497}\u{1F493}\u{1F49E}\u{1F49F}\u{1F63B}\u{1F917}\u{1F48B}\u{1F498}\u{1F49D}\u{1F49B}\u{1F49C}\u{1F499}\u{1F49A}\u{1F9E1}]/u

function anyMatch(res: readonly RegExp[], text: string): boolean {
  for (const re of res) if (re.test(text)) return true
  return false
}

export interface MsgAffection {
  /** Puntaje afectivo del mensaje (E·3 + P·2 + M·1 + O·0.5). */
  score: number
  hasExplicit: boolean
  hasPetname: boolean
  hasEmoji: boolean
  hasOther: boolean
  isNegative: boolean
}

/** Puntúa UN mensaje. `raw` se usa para emojis; el resto sobre texto normalizado. */
export function scoreMessage(raw: string): MsgAffection {
  const t = normalize(raw)
  const hasExplicit = anyMatch(EXPLICIT, t)
  const hasPetname = anyMatch(PETNAMES, t)
  const hasEmoji = AFFECTION_EMOJI.test(raw)
  const hasOther = anyMatch(OTHER_POS, t)
  const isNegative = anyMatch(NEGATIVE, t)
  const score =
    (hasExplicit ? 3 : 0) + (hasPetname ? 2 : 0) + (hasEmoji ? 1 : 0) + (hasOther ? 0.5 : 0)
  return { score, hasExplicit, hasPetname, hasEmoji, hasOther, isNegative }
}

export interface DayAffection {
  /** Densidad de afecto 0..1 (AD_d = A_d/(T_d+k0), clamp). La serie principal. */
  affection: number
  /** Ratio de positividad estilo Gottman: (A_d+1)/(N_d+1). No acotado (≥0). */
  positivityRatio: number
}

const K0 = 5 // suaviza días con pocos mensajes (evita densidad inflada por 1 msg)

/**
 * Afecto del día a partir de los textos de UNA persona (IAE Pasos 1-3). PURO.
 * `affection` es densidad (no verborrea): normaliza por volumen y va 0..1.
 */
export function affectionForTexts(texts: readonly string[]): DayAffection {
  if (texts.length === 0) return { affection: 0, positivityRatio: 1 }
  let A = 0 // puntaje afectivo acumulado del día
  let N = 0 // mensajes con marcador negativo
  for (const raw of texts) {
    const s = scoreMessage(raw)
    A += s.score
    if (s.isNegative) N++
  }
  const density = A / (texts.length + K0)
  return {
    affection: Math.max(0, Math.min(1, density)),
    positivityRatio: (A + 1) / (N + 1),
  }
}
