// SIR V2 — Reconciliación temporal de hechos derivados. PURO.
//
// Deuda del "caso Nicolle": la derivación UNE hechos de distintas épocas sin
// saber que el más reciente reemplaza al viejo. En su ficha coexistían "vive con
// Aaron (comparten vivienda)" (2024) y "Llegó a Alicante" (se mudó a España) —
// contradictorios sobre el MISMO atributo (dónde vive), ambos vivos.
//
// Acá reconciliamos SOLO atributos de UN SOLO VALOR (residencia, estado civil):
// una persona vive en un lugar y tiene un estado civil a la vez, así que el hecho
// MÁS RECIENTE pisa a los viejos del mismo atributo. Los facts llegan en orden
// cronológico (chunks del export, ascendente) → el ÚLTIMO de cada atributo gana.
// Conservador a propósito: la ocupación (multi-valor: rol + ascenso + proyecto)
// NO se toca, para no borrar hechos complementarios. Todo lo demás pasa igual.

export type FactAttribute = 'residence' | 'civil_status'

// Verbos de residencia (dónde vive). Límite accent-aware: `\b` de JS NO reconoce
// vocales acentuadas (ó no es \w), así que usamos lookarounds sobre \p{L} (+/u).
const RESIDENCE_VERB = /(?<!\p{L})(?:vive|viv[íi]a|vivir|reside|resid[íi]a|se mud[óo]|mud[áa]ndose|se instal[óo]|se radic[óo]|radica|de vuelta en)(?!\p{L})/iu

// Reubicación "llegó/se fue/se mudó/regresó/volvió a <Lugar>": solo cuenta si el
// lugar arranca con MAYÚSCULA (nombre propio). Así "llegó a Alicante" cuenta,
// pero "llegó a un acuerdo" / "llegó a las 5" NO (falsos positivos comunes).
const RELOCATION = /(?<!\p{L})(?:lleg[óo]|se fue|se mud[óo]|regres[óo]|volvi[óo])\s+a\s+(?:vivir\s+a\s+)?(\S+)/iu

const CIVIL_STATUS = /(?<!\p{L})(?:solter[oa]s?|casad[oa]s?|en pareja|de novi[oa]s?|separad[oa]s?|divorciad[oa]s?|comprometid[oa]s?|viud[oa]s?)(?!\p{L})/iu

function isRelocation(fact: string): boolean {
  const m = fact.match(RELOCATION)
  if (!m) return false
  return /^[A-ZÁÉÍÓÚÑ]/.test(m[1]) // el lugar debe ser nombre propio (capitalizado)
}

/** Atributo de un solo valor que el hecho afirma, o null si no aplica. */
export function factAttribute(fact: string): FactAttribute | null {
  if (RESIDENCE_VERB.test(fact) || isRelocation(fact)) return 'residence'
  if (CIVIL_STATUS.test(fact)) return 'civil_status'
  return null
}

export interface SupersededFact {
  text: string
  supersededBy: string
  attribute: FactAttribute
}

export interface FactReconciliation {
  /** Hechos vigentes (el más reciente de cada atributo de un solo valor + todo lo demás). */
  facts: string[]
  /** Hechos obsoletados por uno más reciente del mismo atributo. */
  superseded: SupersededFact[]
}

/**
 * Reconcilia una lista de hechos EN ORDEN CRONOLÓGICO (ascendente): dentro de un
 * atributo de un solo valor, el último (más reciente) gana y los anteriores se
 * marcan superseded. Los hechos sin atributo reconocido pasan sin tocar y en su
 * orden original.
 */
export function reconcileFacts(orderedFacts: string[]): FactReconciliation {
  const attrs = orderedFacts.map(factAttribute)
  const lastIdxByAttr = new Map<FactAttribute, number>()
  attrs.forEach((a, i) => { if (a) lastIdxByAttr.set(a, i) })

  const facts: string[] = []
  const superseded: SupersededFact[] = []
  for (let i = 0; i < orderedFacts.length; i++) {
    const a = attrs[i]
    if (a && lastIdxByAttr.get(a) !== i) {
      superseded.push({ text: orderedFacts[i], supersededBy: orderedFacts[lastIdxByAttr.get(a) as number], attribute: a })
    } else {
      facts.push(orderedFacts[i])
    }
  }
  return { facts, superseded }
}
