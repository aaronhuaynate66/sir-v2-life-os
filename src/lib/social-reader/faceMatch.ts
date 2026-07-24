// SIR V2 — Match por cara (capa 2). Helper PURO: arma la instrucción de visión
// y parsea la respuesta. La visión (Qwen-VL barato) compara una FOTO OBJETIVO
// (cara misteriosa del reader IG) contra una galería de CANDIDATOS (contactos
// con avatar) y dice si es la misma persona.
//
// DISCIPLINA (handoff): es una SUGERENCIA, nunca automático — un match errado es
// peor que ninguno. Por eso el parser es CONSERVADOR: "baja"/duda → sin match.
// Al modelo NO se le pasan los nombres de los candidatos (solo números) para que
// juzgue por la CARA, no por el nombre.

export type FaceConfidence = 'alta' | 'media'

export interface FaceMatchParsed {
  /** Número de candidato (1-based) que coincide, o null si ninguno/duda. */
  index: number | null
  confidence: FaceConfidence | null
}

/** Instrucción para el modelo de visión. Los candidatos van numerados 1..N.
 *  Fuertemente sesgada a null: en verificación facial un falso positivo (decir
 *  que es alguien que no es) es peor que no sugerir nada. */
export function buildFaceMatchPrompt(candidateCount: number): string {
  return [
    `Arriba está la FOTO OBJETIVO (una cara a identificar) seguida de ${candidateCount} foto(s) de CANDIDATOS conocidos, numeradas del 1 al ${candidateCount} en el orden en que aparecen.`,
    'OJO: algunas fotos pueden ser capturas de un perfil (con texto, varias imágenes o caras pequeñas de seguidores) o paisajes donde la persona sale lejos/borrosa. Fíjate SOLO en la cara principal y clara de cada foto.',
    'Tu tarea es verificación facial ESTRICTA: decir si la FOTO OBJETIVO y algún candidato son INEQUÍVOCAMENTE la misma persona (mismos rasgos faciales).',
    'REGLAS: (1) Si en la foto objetivo o en el candidato no hay una cara nítida y visible, NO es match. (2) Dos personas distintas del mismo sexo, edad, etnia o estilo NO son match — el parecido general no cuenta. (3) Ante CUALQUIER duda, responde null. Es mucho mejor no sugerir que sugerir mal.',
    `Responde SOLO con este JSON, sin texto extra: {"match": <número 1..${candidateCount} o null>, "confidence": "alta"|"media"|"baja"}.`,
    'Usa "alta" solo si no tienes ninguna duda de que es la misma persona; "media" si es muy probable pero no seguro; en cualquier otro caso match:null.',
  ].join(' ')
}

/** Parsea la respuesta del modelo. Conservador: si no hay índice válido y una
 *  confianza alta/media clara, devuelve sin match (baja/duda no sugiere nada). */
export function parseFaceMatchResponse(raw: string, candidateCount: number): FaceMatchParsed {
  const none: FaceMatchParsed = { index: null, confidence: null }
  if (!raw || candidateCount < 1) return none
  try {
    const s = raw.indexOf('{')
    const e = raw.lastIndexOf('}')
    if (s < 0 || e <= s) return none
    const p = JSON.parse(raw.slice(s, e + 1)) as { match?: unknown; confidence?: unknown }
    const conf: FaceConfidence | null = p.confidence === 'alta' ? 'alta' : p.confidence === 'media' ? 'media' : null
    const idx =
      typeof p.match === 'number' && Number.isInteger(p.match) && p.match >= 1 && p.match <= candidateCount
        ? p.match
        : null
    // Ambos deben ser válidos: sin candidato o con confianza "baja" → no se sugiere.
    if (idx === null || conf === null) return none
    return { index: idx, confidence: conf }
  } catch {
    return none
  }
}
