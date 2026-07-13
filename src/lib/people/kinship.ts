// SIR V2 — Resolución de PALABRAS DE PARENTESCO a la persona vinculada.
//
// "mi papá", "mi vieja", "mi novia" no matchean por nombre (extractCandidateNames
// busca tokens del nombre). El parentesco vive en person_links (person_a_id='self',
// kind='padre'|'madre'|'pareja'|...). Sin esto, preguntar "¿qué me dijo mi papá?"
// no traía a Esteban al contexto y el modelo confabulaba. Esto cierra ese hueco.
//
// PURO: recibe los self-links ya cargados y devuelve los personId a incluir.

/** Vínculo self→persona (person_links con person_a_id='self'). */
export interface SelfLink {
  personId: string
  kind: string
}

/** Palabras en la pregunta que disparan cada `kind` de vínculo self. Las claves
 *  son los `kind` reales de person_links; el valor matchea cómo Aaron los nombra. */
// Límites unicode (?<!\p{L})…(?!\p{L}): el \b de JS falla tras vocal acentuada
// ("papá"), porque á no es \w. Con \p{L} tratamos todas las letras como palabra.
const KIND_TRIGGERS: Record<string, RegExp> = {
  padre: /(?<!\p{L})(?:pap[áa]|papi|padre|viejo)(?!\p{L})/iu,
  madre: /(?<!\p{L})(?:mam[áa]|mami|madre|vieja)(?!\p{L})/iu,
  pareja: /(?<!\p{L})(?:novi[ao]|pareja|espos[ao]|enamorad[ao]|marido)(?!\p{L})/iu,
  hermano: /(?<!\p{L})(?:hermano|broder|bro)(?!\p{L})/iu,
  hermana: /(?<!\p{L})(?:hermana)(?!\p{L})/iu,
  medio_hermana: /(?<!\p{L})(?:hermana|media\s+hermana)(?!\p{L})/iu,
  medio_hermano: /(?<!\p{L})(?:hermano|medio\s+hermano)(?!\p{L})/iu,
  tia: /(?<!\p{L})(?:t[íi]a)(?!\p{L})/iu,
  tio: /(?<!\p{L})(?:t[íi]o)(?!\p{L})/iu,
  prima: /(?<!\p{L})(?:prima)(?!\p{L})/iu,
  primo: /(?<!\p{L})(?:primo)(?!\p{L})/iu,
  abuela: /(?<!\p{L})(?:abuela|abu)(?!\p{L})/iu,
  abuelo: /(?<!\p{L})(?:abuelo|abu)(?!\p{L})/iu,
  padrastro: /(?<!\p{L})(?:padrastro)(?!\p{L})/iu,
  madrastra: /(?<!\p{L})(?:madrastra)(?!\p{L})/iu,
  hija: /(?<!\p{L})mi\s+hija(?!\p{L})/iu,
  hijo: /(?<!\p{L})mi\s+hijo(?!\p{L})/iu,
  suegra: /(?<!\p{L})(?:suegra)(?!\p{L})/iu,
  suegro: /(?<!\p{L})(?:suegro)(?!\p{L})/iu,
}

/**
 * Dado el texto de la consulta y los vínculos self, devuelve los personId de los
 * parientes NOMBRADOS por su rol ("mi papá" → id de Esteban). PURO. Dedupe.
 */
export function resolveKinshipMentions(text: string, selfLinks: SelfLink[]): string[] {
  const q = ` ${text || ''} `
  const out = new Set<string>()
  for (const link of selfLinks) {
    const rx = KIND_TRIGGERS[link.kind]
    if (rx && link.personId && rx.test(q)) out.add(link.personId)
  }
  return [...out]
}
