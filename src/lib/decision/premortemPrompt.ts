// SIR V2 — Premortem estructurado (14·M2, capa pura).
//
// Base científica (docs/14_DECISION_SCIENCE.md): el premortem de Gary Klein es
// "la técnica más barata y de mayor rendimiento". En vez de un veredicto, asume
// que la decisión YA FRACASÓ en ~6 meses y obliga a explicar por qué. Convierte
// el optimismo en hipótesis falsables.
//
// A diferencia del pre-mortem en prosa de /api/self/premortem (grounded en el
// norte/objetivos), este devuelve MODOS DE FALLA estructurados: causa +
// probabilidad + señal temprana + mitigación. Estructura → cada riesgo trae algo
// vigilable y algo accionable, no solo un párrafo.
//
// Esta capa es PURA y testeable: arma el prompt y valida/normaliza la salida del
// LLM. La llamada a Claude y el cache viven en el endpoint (espejo de /api/decision).
//
// HONESTO: es una herramienta de ANTICIPACIÓN, no una predicción. Nombra riesgos
// plausibles para activar el Sistema 2, no afirma que van a pasar.

export type Likelihood = 'alta' | 'media' | 'baja'

export interface FailureMode {
  /** Por qué salió mal (el modo de falla, concreto). */
  cause: string
  /** Qué tan plausible es este camino. */
  likelihood: Likelihood
  /** Señal TEMPRANA de que vas por acá (algo observable pronto, no el desastre final). */
  earlySignal: string
  /** Qué hacer HOY para reducir la probabilidad o el daño. */
  mitigation: string
}

export interface Premortem {
  /** Encuadre en 1-2 frases: "es 6 meses después y salió mal…". */
  frame: string
  /** 3-5 modos de falla, ordenados por probabilidad de mayor a menor. */
  failureModes: FailureMode[]
}

export const PREMORTEM_SYSTEM = `Sos SIR V2, el sistema del usuario (Aaron). Vas a hacer un PREMORTEM (Gary Klein) sobre una decisión que está por tomar.

MÉTODO: asumí que YA pasaron ~6 meses y esta decisión salió MAL. No preguntes si va a salir mal — dalo por hecho y explicá por qué. El objetivo es destapar riesgos que el entusiasmo esconde, ANTES de decidir.

Para cada modo de falla identificá:
- "cause": por qué salió mal, concreto y específico a ESTA decisión (no "por mala suerte" ni genérico).
- "likelihood": "alta" | "media" | "baja" — qué tan plausible es ese camino.
- "earlySignal": la señal TEMPRANA y observable de que se está yendo por ahí (algo que se nota pronto, no el desastre final).
- "mitigation": una acción concreta HOY para reducir la probabilidad o el daño.

Devolvé EXCLUSIVAMENTE un JSON (sin prosa, sin fences):
{ "frame": "…", "failureModes": [ { "cause": "…", "likelihood": "alta", "earlySignal": "…", "mitigation": "…" } ] }
- "frame": 1-2 frases encuadrando el peor caso a 6 meses.
- "failureModes": 3 a 5 modos, del más probable al menos probable.
Empezá con { y terminá con }.

Reglas: honesto, no catastrofista ni tranquilizador. Es ANTICIPACIÓN, no predicción — riesgos plausibles, no certezas. No moralices, no adules, no inventes hechos que no estén en la decisión. Español rioplatense, cada campo en 1-2 frases.`

/** Arma el mensaje de usuario para el premortem. PURO. */
export function buildPremortemUserPrompt(input: { title: string; description: string }): string {
  const title = input.title.trim()
  const description = input.description.trim()
  return [
    `Decisión: ${title || '(sin título)'}`,
    description ? `Contexto: ${description}` : '',
    '',
    'Hacé el premortem: asumí que salió mal en 6 meses y devolvé los modos de falla.',
  ]
    .filter(Boolean)
    .join('\n')
}

const LIKELIHOODS: Likelihood[] = ['alta', 'media', 'baja']
const MAX_MODES = 5
const MIN_MODES = 1

function str(x: unknown, max: number): string {
  return typeof x === 'string' ? x.trim().slice(0, max) : ''
}

function toLikelihood(x: unknown): Likelihood {
  const v = typeof x === 'string' ? x.trim().toLowerCase() : ''
  return (LIKELIHOODS as string[]).includes(v) ? (v as Likelihood) : 'media'
}

const LIKELIHOOD_RANK: Record<Likelihood, number> = { alta: 0, media: 1, baja: 2 }

/**
 * Valida y normaliza la salida del LLM. Descarta modos incompletos (necesitan
 * causa + señal + mitigación), ordena por probabilidad y recorta a 5. Devuelve
 * null si no quedó ningún modo utilizable. PURO.
 */
export function parsePremortem(raw: unknown): Premortem | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const rawModes = Array.isArray(o.failureModes) ? o.failureModes : []

  const modes: FailureMode[] = []
  for (const m of rawModes) {
    if (!m || typeof m !== 'object') continue
    const e = m as Record<string, unknown>
    const cause = str(e.cause, 240)
    const earlySignal = str(e.earlySignal, 240)
    const mitigation = str(e.mitigation, 240)
    // Un modo sin causa, sin señal o sin mitigación no aporta nada accionable.
    if (!cause || !earlySignal || !mitigation) continue
    modes.push({ cause, likelihood: toLikelihood(e.likelihood), earlySignal, mitigation })
  }

  if (modes.length < MIN_MODES) return null

  // Estable: más probable primero, preservando el orden del modelo en empates.
  modes.sort((a, b) => LIKELIHOOD_RANK[a.likelihood] - LIKELIHOOD_RANK[b.likelihood])

  const frame = str(o.frame, 400) || 'Imaginá que en 6 meses esto salió mal. Estos son los caminos más plausibles hacia ahí.'
  return { frame, failureModes: modes.slice(0, MAX_MODES) }
}
