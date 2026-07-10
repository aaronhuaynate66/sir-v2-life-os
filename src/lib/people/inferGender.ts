// SIR V2 — Inferencia de género por nombre (heurística, sin LLM). PURO.
//
// Sirve para PROPONER (nunca imponer) el género de una persona: al crearla, al
// detectar que falta, y para saltar en "lo que SIR te pregunta". El género es el
// gate de la inteligencia conductual/ciclo (fichaProfile.showCycleForecast), así
// que dejarlo en blanco deja motores dormidos.
//
// Estrategia: nombre de pila normalizado → lista curada (confianza alta) →
// terminación española (-a femenino / -o masculino, confianza baja) → null.
// Es una PROPUESTA: el flujo siempre deja a Aaron confirmar/corregir.

export type Gender = 'female' | 'male'

export interface GenderGuess {
  gender: Gender | null
  /** 'alta' = nombre en lista curada · 'baja' = solo por terminación · null → sin guess. */
  confidence: 'alta' | 'baja' | null
}

/** Nombres de pila femeninos (curados; incluye los presentes en la base de Aaron). */
const FEMALE = new Set<string>([
  'ada', 'amira', 'ana', 'analia', 'angela', 'aeylin', 'carolina', 'cristina', 'dayana', 'deifilia',
  'delicia', 'diana', 'emperatriz', 'fabiola', 'fernanda', 'gabriela', 'ivis', 'janeth', 'jaqueline',
  'jimena', 'karina', 'laura', 'lucia', 'luciana', 'maria', 'mariana', 'marita', 'massiel', 'miluska',
  'nicolle', 'paula', 'sheyla', 'silvana', 'silvia', 'solmaira', 'sofia', 'valentina', 'veronica',
  'rosa', 'rosalia', 'daniela', 'camila', 'andrea', 'claudia', 'patricia', 'monica', 'carla', 'julia',
])

/** Nombres de pila masculinos (curados). */
const MALE = new Set<string>([
  'adrian', 'alejandro', 'alex', 'alvaro', 'anthony', 'bill', 'cebastian', 'sebastian', 'diego',
  'eusebio', 'esteban', 'fernando', 'francisco', 'gianmarco', 'guillermo', 'hans', 'harol', 'javier',
  'jesse', 'jordi', 'jorge', 'joseph', 'josehp', 'juan', 'kevin', 'leo', 'luis', 'manuel', 'pablo',
  'ricardo', 'richard', 'rizal', 'rodrigo', 'victor', 'walter', 'william', 'anthony', 'bruno', 'carlos',
  'cesar', 'daniel', 'david', 'gabriel', 'hugo', 'ivan', 'martin', 'miguel', 'oscar', 'raul', 'sergio',
])

/** Nombres ambiguos/unisex donde NO arriesgamos por terminación (pedimos). */
const AMBIGUOUS = new Set<string>(['sasa', 'shian', 'guadalupe', 'cruz', 'trinidad', 'rene', 'noa'])

/** Primer token, minúsculas, sin acentos, solo letras. */
function firstName(full: string): string {
  const tok = (full ?? '').trim().split(/\s+/)[0] ?? ''
  return tok.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '')
}

/**
 * Propone el género a partir del nombre. Nunca decide sola — es un guess con
 * confianza para que el flujo confirme. PURO.
 */
export function inferGender(fullName: string): GenderGuess {
  const name = firstName(fullName)
  if (!name || AMBIGUOUS.has(name)) return { gender: null, confidence: null }
  if (FEMALE.has(name)) return { gender: 'female', confidence: 'alta' }
  if (MALE.has(name)) return { gender: 'male', confidence: 'alta' }
  // Terminación española (señal débil): -a/-ía femenino, -o masculino.
  if (/(?:a|ia)$/.test(name)) return { gender: 'female', confidence: 'baja' }
  if (/o$/.test(name)) return { gender: 'male', confidence: 'baja' }
  return { gender: null, confidence: null }
}
