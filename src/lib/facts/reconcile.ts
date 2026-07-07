// SIR V2 — Reconciliación temporal de hechos derivados. PURO.
//
// Deuda del "caso Nicolle": la derivación UNE hechos de distintas épocas sin
// saber que el más reciente reemplaza al viejo. En su ficha coexistían "vive con
// Aaron" (2024) y "se mudó a inicios de noviembre de 2024" — contradictorios
// sobre dónde vive, ambos vivos.
//
// CONSERVADOR a propósito (aprendido a los golpes): SOLO reconciliamos residencia
// cuando hay una MUDANZA EXPLÍCITA — un corte limpio que reemplaza dónde vive.
// Un "vive con X" / "vive en Y" NO supersede a otros hechos de vivienda: suelen
// ser COMPLEMENTARIOS ("vive en Lima" + "vive con su esposo" describen la misma
// casa desde dos ángulos). Sin mudanza, todo convive. Nada más se toca.

export type FactAttribute = 'residence'

// Verbos de residencia (dónde/con quién vive). NO disparan supersesión por sí
// solos — solo marcan qué hechos una MUDANZA posterior deja obsoletos.
const RESIDENCE_VERB = /(?<!\p{L})(?:vive|viv[íi]a|vivir|reside|resid[íi]a|radica|de vuelta en)(?!\p{L})/iu

// MUDANZA inequívoca: verbos que SIEMPRE significan un cambio de casa.
const CLEAR_MOVE = /(?<!\p{L})(?:se mud[óo]|mud[áa]ndose|se instal[óo]|se radic[óo]|se fue a vivir)(?!\p{L})/iu

// MUDANZA ambigua: "llegó/se fue/regresó/volvió a <Lugar>" — solo cuenta si el
// lugar es NOMBRE PROPIO (capitalizado). Evita "llegó a un acuerdo" / "a las 5".
const AMBIG_MOVE = /(?<!\p{L})(?:lleg[óo]|se fue|regres[óo]|volvi[óo])\s+a\s+(?:vivir\s+a\s+)?(\S+)/iu

/** ¿El hecho afirma una MUDANZA (cambio de residencia)? */
export function isRelocation(fact: string): boolean {
  if (CLEAR_MOVE.test(fact)) return true
  const m = fact.match(AMBIG_MOVE)
  return !!m && /^[A-ZÁÉÍÓÚÑ]/.test(m[1]) // el destino debe ser nombre propio
}

/** ¿El hecho es sobre dónde/con quién vive (lo que una mudanza deja obsoleto)? */
function isResidence(fact: string): boolean {
  return isRelocation(fact) || RESIDENCE_VERB.test(fact)
}

/** Atributo de un solo valor que el hecho afirma, o null. (Hoy solo residencia.) */
export function factAttribute(fact: string): FactAttribute | null {
  return isResidence(fact) ? 'residence' : null
}

export interface SupersededFact {
  text: string
  supersededBy: string
  attribute: FactAttribute
}

export interface FactReconciliation {
  /** Hechos vigentes. */
  facts: string[]
  /** Hechos de vivienda anteriores a una mudanza explícita → obsoletos. */
  superseded: SupersededFact[]
}

/**
 * Reconcilia hechos EN ORDEN CRONOLÓGICO. Regla única y conservadora: si hay una
 * MUDANZA explícita, TODOS los hechos de vivienda ANTERIORES a la última mudanza
 * quedan obsoletos (la mudanza los reemplaza). Sin mudanza, nada se supersede.
 */
export function reconcileFacts(orderedFacts: string[]): FactReconciliation {
  let lastMoveIdx = -1
  const relocation = orderedFacts.map((f) => isRelocation(f))
  for (let i = 0; i < orderedFacts.length; i++) if (relocation[i]) lastMoveIdx = i

  const facts: string[] = []
  const superseded: SupersededFact[] = []
  for (let i = 0; i < orderedFacts.length; i++) {
    if (lastMoveIdx >= 0 && i < lastMoveIdx && isResidence(orderedFacts[i])) {
      superseded.push({ text: orderedFacts[i], supersededBy: orderedFacts[lastMoveIdx], attribute: 'residence' })
    } else {
      facts.push(orderedFacts[i])
    }
  }
  return { facts, superseded }
}
