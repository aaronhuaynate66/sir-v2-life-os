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

/** Instrucción para el modelo de visión. Los candidatos van numerados 1..N. */
export function buildFaceMatchPrompt(candidateCount: number): string {
  return [
    `Arriba está la FOTO OBJETIVO (una persona a identificar) seguida de ${candidateCount} foto(s) de CANDIDATOS conocidos, numeradas del 1 al ${candidateCount} en el orden en que aparecen.`,
    'Decide si la FOTO OBJETIVO es LA MISMA PERSONA que alguno de los candidatos.',
    'Sé CONSERVADOR: un simple parecido no basta, tiene que ser la misma cara. Otra persona del mismo género, edad o estilo parecido NO es match. Ante la duda, responde null.',
    `Responde SOLO con este JSON, sin texto extra: {"match": <número 1..${candidateCount} o null>, "confidence": "alta"|"media"|"baja"}.`,
    'Usa "alta" solo si estás muy seguro de que es la misma persona; "media" si es probable; "baja" (o match null) si no lo es o no puedes distinguir.',
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
