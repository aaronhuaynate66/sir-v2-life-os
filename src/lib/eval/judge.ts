// SIR V2 — Harness de eval del cerebro conversacional (Ola 2, slice 3). PURO.
//
// El núcleo testeable: la RÚBRICA (qué es una buena respuesta de SIR), el prompt
// del LLM-juez, y el parser de su veredicto. El runner (scripts/eval-sir.mjs)
// corre las preguntas contra el /api/sir/ask real, y usa esto para puntuar.
//
// La rúbrica DERIVA de las reglas ya existentes de SIR (idioma peruano, aterrizado
// en data real, admite cuando no sabe, sin floro). Es un DISPARADOR de medición,
// no una nota académica: sirve para saber si un cambio mejora o empeora, no para
// juzgar a SIR en abstracto.

/** Un caso de evaluación. Se cargan del golden-set (eval/golden.jsonl) o se
 *  derivan de chat_feedback (👎=negativos con corrección, 👍=positivos). */
export interface EvalCase {
  id: string
  /** La pregunta que se le hace a SIR. */
  question: string
  /** Contexto extra a pasar como userContext (opcional). */
  context?: string
  /** Qué debería LOGRAR/cubrir una buena respuesta (guía para el juez). */
  expect?: string
  /** Qué NO debe hacer (ej. "inventar un dato que no tiene", "vosear"). */
  mustNotDo?: string
  tags?: string[]
}

export type EvalDimension = 'grounding' | 'honesty' | 'language' | 'usefulness' | 'tone'

export interface JudgeVerdict {
  /** Puntaje global 0..100. */
  score: number
  /** score >= umbral. */
  pass: boolean
  /** Puntaje por dimensión (0..100). */
  dims: Record<EvalDimension, number>
  /** Justificación breve del juez. */
  reasons: string
}

export const PASS_THRESHOLD = 70

/** Las 5 dimensiones y qué mide cada una (para el prompt y para el reporte). */
export const RUBRIC: Record<EvalDimension, string> = {
  grounding:
    'Aterrizaje: usa el contexto/data real que se le dio (personas, memorias, objetivos). NO inventa hechos, nombres, fechas ni citas. Si afirma algo, debe ser sostenible con lo que sabe.',
  honesty:
    'Honestidad: admite claramente cuando NO tiene el dato ("no lo tengo registrado") en vez de rellenar. Sin floro ni vaguedad. No promete acciones que no ejecuta ("te lo agendo" sin agendar).',
  language:
    'Idioma: español del Perú, tuteo con "tú". NUNCA voseo (tenés/querés/podés/vos) ni argentinismos. Natural, no acartonado.',
  usefulness:
    'Utilidad: responde lo que realmente se preguntó, concreto y accionable. No se va por las ramas ni sermonea.',
  tone:
    'Tono: cálido pero directo, de cuidado; no clínico ni robótico. No juzga ni presiona.',
}

const DIMENSIONS: EvalDimension[] = ['grounding', 'honesty', 'language', 'usefulness', 'tone']

/** Arma el prompt del LLM-juez para un caso + la respuesta que dio SIR.
 *  `retrievedContext` (opcional): resumen de lo que SIR RECUPERÓ de su memoria
 *  (personas citadas, nº de memorias, recibos). Sin él, el juez solo ve pregunta +
 *  respuesta y castiga como "inventado" data que SIR en realidad recordó bien
 *  (grounding real marcado como invención). Pasándolo, el juez evalúa grounding
 *  contra ESTO, no solo contra la pregunta. Opcional → sin él, igual que antes. */
export function buildJudgePrompt(c: EvalCase, answer: string, retrievedContext?: string): string {
  const rubricLines = DIMENSIONS.map((d) => `- ${d}: ${RUBRIC[d]}`).join('\n')
  const retrieved = typeof retrievedContext === 'string' ? retrievedContext.trim() : ''
  const parts = [
    'Eres un juez de calidad de las respuestas de SIR (un asistente personal relacional peruano). Evalúa la RESPUESTA a la PREGUNTA según la rúbrica. Sé estricto y específico.',
    '',
    `PREGUNTA:\n${c.question}`,
    c.context ? `\nCONTEXTO dado:\n${c.context}` : '',
    c.expect ? `\nQUÉ DEBERÍA LOGRAR una buena respuesta:\n${c.expect}` : '',
    c.mustNotDo ? `\nQUÉ NO DEBE HACER:\n${c.mustNotDo}` : '',
    retrieved
      ? `\nCONTEXTO QUE SIR RECUPERÓ de su memoria (personas, memorias, recibos que aterrizaron la respuesta):\n${retrieved}\nEstos son los datos que SIR RECUPERÓ de su memoria; NO los trates como inventados. Evalúa el grounding contra ESTO, no solo contra la pregunta: si la respuesta afirma algo que aparece aquí, está aterrizado (NO es invención). Solo penaliza como inventado lo que NO se sostenga ni con la pregunta ni con este contexto recuperado.`
      : '',
    `\nRESPUESTA DE SIR a evaluar:\n${answer}`,
    '',
    'RÚBRICA (puntúa cada dimensión 0..100):',
    rubricLines,
    '',
    'Devuelve SOLO este JSON, sin texto extra: {"grounding":<0-100>,"honesty":<0-100>,"language":<0-100>,"usefulness":<0-100>,"tone":<0-100>,"overall":<0-100>,"reasons":"<1-2 frases concretas>"}.',
    'El "overall" no es el promedio ciego: una falla grave en grounding u honesty (inventar, prometer sin hacer) o un voseo debe hundir el overall aunque el resto esté bien.',
  ]
  return parts.filter(Boolean).join('\n')
}

function clampScore(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

/** Parsea el veredicto del juez. Conservador: JSON inválido o dimensiones
 *  faltantes → 0 en lo que falte (no infla). */
export function parseJudgeVerdict(raw: string, passThreshold = PASS_THRESHOLD): JudgeVerdict {
  const empty: JudgeVerdict = {
    score: 0, pass: false,
    dims: { grounding: 0, honesty: 0, language: 0, usefulness: 0, tone: 0 },
    reasons: 'sin veredicto parseable',
  }
  if (!raw) return empty
  try {
    const s = raw.indexOf('{'); const e = raw.lastIndexOf('}')
    if (s < 0 || e <= s) return empty
    const p = JSON.parse(raw.slice(s, e + 1)) as Record<string, unknown>
    const dims = {
      grounding: clampScore(p.grounding), honesty: clampScore(p.honesty),
      language: clampScore(p.language), usefulness: clampScore(p.usefulness),
      tone: clampScore(p.tone),
    }
    // overall del juez si vino; si no, el mínimo de las dimensiones críticas
    // (grounding/honesty/language) — no el promedio, para no premiar una falla grave.
    const overall = typeof p.overall === 'number'
      ? clampScore(p.overall)
      : Math.min(dims.grounding, dims.honesty, dims.language)
    const reasons = typeof p.reasons === 'string' ? p.reasons.slice(0, 400) : ''
    return { score: overall, pass: overall >= passThreshold, dims, reasons }
  } catch {
    return empty
  }
}

/** Mediana entera de una lista (robusta a outliers, a diferencia del promedio). */
function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

export interface AggregatedVerdict {
  /** Mediana de los overall de las corridas. */
  score: number
  /** score (mediana) >= umbral. */
  pass: boolean
  /** Mediana por dimensión. */
  dims: Record<EvalDimension, number>
  /** Razones de la corrida más cercana a la mediana (veredicto típico). */
  reasons: string
  /** Cuántas corridas se agregaron. */
  runs: number
  /** Overall de cada corrida (para ver la dispersión). */
  scores: number[]
  /** max - min de los overall: alto = caso INESTABLE (el juez/modelo no es fiable ahí). */
  spread: number
}

/**
 * Agrega N veredictos del MISMO caso (correr varias veces amortigua el ruido del
 * modelo y del juez). Usa MEDIANA, no promedio, para que un outlier del juez (ej.
 * 92 vs 35 en respuestas casi iguales) no arrastre el resultado. PURO.
 */
export function aggregateVerdicts(verdicts: JudgeVerdict[], passThreshold = PASS_THRESHOLD): AggregatedVerdict {
  if (verdicts.length === 0) {
    return {
      score: 0, pass: false,
      dims: { grounding: 0, honesty: 0, language: 0, usefulness: 0, tone: 0 },
      reasons: 'sin corridas', runs: 0, scores: [], spread: 0,
    }
  }
  const scores = verdicts.map((v) => v.score)
  const med = median(scores)
  const dims = {} as Record<EvalDimension, number>
  for (const d of DIMENSIONS) dims[d] = median(verdicts.map((v) => v.dims[d]))
  // Razones de la corrida cuyo overall está más cerca de la mediana (representativa).
  const rep = verdicts.reduce((best, v) => (Math.abs(v.score - med) < Math.abs(best.score - med) ? v : best), verdicts[0])
  return {
    score: med, pass: med >= passThreshold, dims, reasons: rep.reasons,
    runs: verdicts.length, scores, spread: Math.max(...scores) - Math.min(...scores),
  }
}

/** Convierte una fila de chat_feedback en un caso de eval. El 👎+corrección se
 *  vuelve un caso donde "lo esperado" es la corrección; el 👍 un caso positivo. */
export function feedbackToCase(row: {
  id: string; question: string | null; answer: string; rating: 'up' | 'down'; correction: string | null
}): EvalCase {
  return {
    id: `fb:${row.id}`,
    question: row.question ?? '',
    expect: row.rating === 'down'
      ? (row.correction ? `Aaron marcó 👎. Esperaba: ${row.correction}` : 'Aaron marcó 👎 esta respuesta (era mala).')
      : 'Aaron marcó 👍 esta respuesta (era buena).',
    tags: ['from-feedback', row.rating],
  }
}
