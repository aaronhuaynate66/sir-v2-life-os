// SIR V2 — Alter ego filosófico: selector escenario → corrientes. PURO.
//
// Dada una situación (texto libre + dominio/persona opcional), detecta las "tags"
// del escenario por heurística de palabras, puntúa cada escuela y devuelve las 1-3
// que mejor sirven. Guardrail: si entra una escuela de PODER (Maquiavelo), suma
// SIEMPRE a Kant como freno ético. Sin LLM: es la capa determinística; una
// narrativa opcional puede montarse encima con el modelo.

import { SCHOOLS, schoolById, type School, type StanceTag, type Domain } from './schools'

export interface StanceContext {
  situation: string
  domain?: Domain
  personName?: string
}

export interface StancePick {
  school: School
  score: number
  reason: string
  /** true = agregada como freno ético (Kant sobre una movida de poder). */
  isCheck?: boolean
}

export interface StanceResult {
  tags: StanceTag[]
  domain: Domain
  picks: StancePick[]
  ethicalLine: string
}

const TAG_KEYWORDS: Record<StanceTag, RegExp> = {
  control: /\bcontrol|no depende|no puedo con|fuera de mi|ansied|ansios|nervios|no está en mis manos/i,
  perdida: /\bpierd|perd[ií]|duel|dolor|extra[ñn]|luto|termin[oó]|ruptura|se fue|falleci|triste/i,
  poder: /jefe|aumento|ascenso|negoci|\bpoder|pol[ií]tic|autoridad|convencer|posicion|reuni[oó]n|cliente|equipo/i,
  integridad: /mentir|mentira|honest|integridad|enga[ñn]|ocultar|traici[oó]n|promet[ií]|valores|deber[ií]a ser sincero/i,
  sentido: /sentido|vac[ií]o|para qu[eé]|nada tiene|burnout|quemad|sin ganas|existencial|no vale la pena/i,
  motivacion: /motiv|\bmiedo|no me animo|arranc|empez|procrastin|ganas|impulso|paraliz/i,
  habito: /h[aá]bito|rutina|constan|disciplina|todos los d[ií]as|repetir|sosten/i,
  soltar: /soltar|aferr|dejar ir|apego|controlar todo|obsesion|no puedo dejar/i,
  decision: /decid|elegir|opci[oó]n|dilema|no s[eé] qu[eé]|dos caminos|deber[ií]a|encrucijada/i,
  conflicto: /pelea|discusi[oó]n|conflicto|enoj|bronca|tensi[oó]n|choque|resentim/i,
  incertidumbre: /incertid|no s[eé] qu[eé] va|futuro|dudas|inseguro|riesgo|no sé si/i,
  reinvencion: /cambiar|reinvent|nueva etapa|mudanza|dejar todo|empezar de cero|transform|otra vida/i,
}

export function detectTags(situation: string): StanceTag[] {
  const out: StanceTag[] = []
  for (const [tag, re] of Object.entries(TAG_KEYWORDS) as [StanceTag, RegExp][]) {
    if (re.test(situation)) out.push(tag)
  }
  return out
}

function inferDomain(tags: StanceTag[]): Domain {
  if (tags.includes('poder') || tags.includes('integridad')) return 'profesional'
  if (tags.includes('perdida') || tags.includes('conflicto')) return 'afectivo'
  return 'ambos'
}

const ETHICAL_LINE =
  'Sabiduría para enfrentar, no armas para dañar: leer el poder no es licencia para manipular. Si tu movida solo funciona ocultándola, no la hagas.'

export function selectStances(ctx: StanceContext): StanceResult {
  const tags = detectTags(ctx.situation || '')
  const domain = ctx.domain ?? inferDomain(tags)

  const scored = SCHOOLS.map((school) => {
    const matched = school.bestFor.filter((t) => tags.includes(t))
    let score = matched.length * 2
    if (school.domains.includes('ambos') || school.domains.includes(domain)) score += 1
    const reason = matched.length
      ? `Encaja con lo que está en juego: ${matched.join(', ')}.`
      : 'Marco de fondo, aplicable en general.'
    return { school, score, reason, matched }
  }).sort((a, b) => b.score - a.score)

  // Top picks: los que puntuaron por match real (score alto); mínimo 1.
  const withMatch = scored.filter((s) => s.matched.length > 0)
  const chosen = (withMatch.length ? withMatch : scored).slice(0, 3)

  const picks: StancePick[] = chosen.map(({ school, score, reason }) => ({ school, score, reason }))

  // Guardrail: si hay escuela de poder y Kant no está, sumarlo como freno.
  const hasPower = picks.some((p) => p.school.isPower)
  const hasKant = picks.some((p) => p.school.id === 'kant')
  if (hasPower && !hasKant) {
    const kant = schoolById('kant')!
    picks.push({ school: kant, score: 0, reason: 'Freno ético sobre la lectura de poder: leé los incentivos, pero no cruces la línea de usar a nadie.', isCheck: true })
  }

  return { tags, domain, picks, ethicalLine: ETHICAL_LINE }
}
