// SIR V2 — Sugerencia de contacto para la bandeja "¿quién es quién?".
//
// El reader ve un handle de IG (a veces sin nombre) que no matcheó a nadie. Para
// que Aaron NO pierda tiempo eligiendo del combo, SIR PROPONE el contacto más
// probable. Los handles suelen ser el nombre pegado ("fiorellanicolini" →
// Fiorella Nicolini) o inicial+apellido ("dmedina" → Diego Medina). PURO.
//
// CONSERVADOR: si dos personas empatan en el mejor puntaje → no sugiere (mejor
// nada que una sugerencia equivocada). El usuario siempre puede elegir a mano.

export interface SuggestPersonLite {
  id: string
  name: string
  instagramHandle?: string
}

export interface MatchSuggestion {
  personId: string
  personName: string
  confidence: 'alta' | 'media'
}

/** minúsculas, sin tildes, solo alfanumérico pegado. "Fiorella Nicolini" → "fiorellanicolini". */
function squash(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

/** tokens en minúscula sin tildes. "Diego Medina Stein" → ["diego","medina","stein"]. */
function tokens(s: string): string[] {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
}

/** Puntaje de qué tan probable es que `handle`/`name` sea `person`. 0 = nada. */
function scorePerson(hSquash: string, nameSquash: string, nameTokens: string[], person: SuggestPersonLite): { score: number; confidence: 'alta' | 'media' } {
  const pSquash = squash(person.name)
  const pTokens = tokens(person.name)
  if (pSquash.length < 4) return { score: 0, confidence: 'media' }

  // 1) Nombre pegado idéntico al handle (o al nombre capturado) → altísima.
  if (pSquash === hSquash || (nameSquash && pSquash === nameSquash)) return { score: 5, confidence: 'alta' }

  // 2) Uno contiene al otro con largo suficiente (handle con sufijos: "fiorellanicolini_" ).
  const longEnough = (a: string, b: string) => Math.min(a.length, b.length) >= 6
  if (hSquash && longEnough(hSquash, pSquash) && (hSquash.includes(pSquash) || pSquash.includes(hSquash))) {
    return { score: 4, confidence: 'alta' }
  }

  // 3) Inicial + apellido pegados ("dmedina" → Diego Medina; "dmedinastein"
  //    también). Probamos inicial+primer-apellido e inicial+todos-los-apellidos.
  if (pTokens.length >= 2 && hSquash) {
    const initial = pTokens[0][0]
    const surnames = pTokens.slice(1)
    const cands = [initial + surnames[0], initial + surnames.join('')]
    for (const c of cands) {
      if (c.length >= 5 && (hSquash === c || hSquash.startsWith(c))) {
        return { score: 3, confidence: 'media' }
      }
    }
  }

  // 4) Solape de tokens con el nombre capturado (si vino): ≥2 tokens compartidos.
  if (nameTokens.length >= 2) {
    const shared = nameTokens.filter((t) => t.length >= 3 && pTokens.includes(t)).length
    if (shared >= 2) return { score: 2, confidence: 'media' }
  }

  // 5) El HANDLE lleva varios tokens del nombre, pegados o con separadores
  //    ("dayana.ruiz23" → Dayana Ruiz Pérez). Cubre el hueco medido: cuando IG
  //    muestra SOLO el primer nombre, las reglas 1-4 no alcanzan (2/80) porque
  //    un token suelto no basta para arriesgar — pero el handle suele traer el
  //    apellido. Tokens de ≥4 letras para no cazar "ana"/"luis" dentro de
  //    cualquier palabra, y ≥2 distintos para que no sea casualidad.
  const fuertes = pTokens.filter((t) => t.length >= 4)
  if (hSquash.length >= 8 && fuertes.length >= 2) {
    const enHandle = fuertes.filter((t) => hSquash.includes(t)).length
    if (enHandle >= 2) return { score: 3, confidence: 'media' }
  }

  // 6) Nombre capturado de UN solo token que es el primer nombre de la persona,
  //    y el handle trae además un apellido suyo ("Dayana" + @dayi.ruiz).
  if (nameTokens.length === 1 && nameTokens[0].length >= 4 && pTokens[0] === nameTokens[0]) {
    const apellidos = pTokens.slice(1).filter((t) => t.length >= 4)
    if (hSquash && apellidos.some((t) => hSquash.includes(t))) return { score: 3, confidence: 'media' }
  }

  return { score: 0, confidence: 'media' }
}

/**
 * Sugiere el contacto más probable para un handle/nombre no asignado. null si no
 * hay candidato claro o si hay empate en el mejor puntaje (ambiguo → no arriesga).
 */
export function suggestPersonForHandle(
  input: { handle: string | null; name: string | null },
  people: SuggestPersonLite[],
): MatchSuggestion | null {
  const hSquash = squash(input.handle ?? '')
  const nameSquash = squash(input.name ?? '')
  const nameTokens = tokens(input.name ?? '')
  if (!hSquash && !nameSquash) return null

  let best: { person: SuggestPersonLite; score: number; confidence: 'alta' | 'media' } | null = null
  let tie = false
  for (const p of people) {
    const { score, confidence } = scorePerson(hSquash, nameSquash, nameTokens, p)
    if (score === 0) continue
    if (!best || score > best.score) { best = { person: p, score, confidence }; tie = false }
    else if (score === best.score && p.id !== best.person.id) { tie = true }
  }
  if (!best || tie) return null
  return { personId: best.person.id, personName: best.person.name, confidence: best.confidence }
}
