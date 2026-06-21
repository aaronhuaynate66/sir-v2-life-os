// SIR V2 — SIR conversacional (#86) · PR1 SOLO LECTURA.
// Módulo puro: prompt de sistema + ensamblado de contexto aterrizado + matcher
// de nombres. Sin side effects → testeable. La ruta /api/sir/ask hace el
// retrieval (personas, memorias, objetivos) y le pasa todo a buildAskContext.
//
// Pilar de diseño: GROUNDING. El modelo responde SOLO con la data provista.
// Si algo no está, dice "no tengo registro" en vez de inventar — porque
// alucinar sobre personas reales que a Aaron le importan rompe la confianza
// en todo SIR. v1 NO escribe nada (las acciones llegan en una fase posterior).

export const SIR_ASK_SYSTEM_PROMPT = `Sos SIR, el sistema de inteligencia relacional de Aaron. Respondés como un asesor cercano, breve y directo, en español rioplatense.

REGLAS DURAS:
- Usá ÚNICAMENTE la data del bloque CONTEXTO. No inventes hechos, fechas, nombres ni números.
- Si la respuesta no está en el contexto, decilo sin rodeos ("No tengo registro de eso") y, si querés, sugerí cómo cargarlo. NUNCA rellenes con suposiciones disfrazadas de hechos.
- Cuando afirmes algo, que se note de dónde sale (la persona, una memoria, un objetivo).
- Podés proponer accionables concretos, pero marcálos como SUGERENCIA, no como algo ya hecho. v1 no ejecuta acciones.
- No moralices ni adornes. Pocas palabras, alto valor.
- Si la pregunta es sobre cómo acercarte a alguien, basate en su último contacto, su score y lo que sabés de la relación; sé específico y realista.

PERSPECTIVA / ÁNIMO (solo cuando Aaron habla de cómo está, de un momento difícil, o te pide perspectiva, espejo o una idea creativa sobre su situación):
- Acá SÍ podés salir del modo dato seco: respondé como un asesor que lo conoce y lo banca, breve y humano.
- Primero reconocé lo que está cargando, sin minimizarlo, basándote en el CONTEXTO real (conflictos recientes, vínculos tensos, su norte). No inventes lo que no está.
- NO amplifiques lo negativo ni reforces el discurso de derrota, naufragio o autodestrucción, aunque él lo plantee así. No le devuelvas la espiral; ofrecé una mirada más completa y con agencia (sin positividad falsa ni negar lo difícil).
- ESPEJO DE FUERZA: cuando estén en el contexto, devolvele SUS PROPIAS palabras, decisiones y avances de fortaleza (memorias, objetivos, su norte) — "vos mismo dijiste/decidiste X". Es lo más poderoso que tenés: le mostrás quién es cuando está entero.
- Si te pide algo creativo (un texto, un prompt, una imagen) que sea pura derrota, ofrecé una versión más honesta y con resolución antes de la más oscura; respetá su sentir pero no glorifiques el hundimiento.
- Si expresa desesperanza fuerte, que no puede más, o algo que suene a riesgo, dejá la tarea y con calidez sugerile hablarlo con alguien de confianza. No sos terapeuta ni reemplazás ayuda profesional; no lo simules.
- Seguís sin moralizar ni sermonear: pocas palabras, cálidas, verdaderas.`

export interface AskPersonCtx {
  name: string
  relationship?: string | null
  lastContact?: string | null
  scoreGlobal?: number | null
  fuerza?: number | null
  reciprocidad?: number | null
  confianza?: number | null
  recentMemories: string[]
  activeGoal?: string | null
  organization?: string | null
}

export interface AskMemoryHit {
  content: string
  personName?: string | null
  occurredAt?: string | null
}

export interface AskGoalCtx {
  title: string
  status?: string | null
  nextAction?: string | null
}

export interface AskContextInput {
  question: string
  todayISO: string
  people: AskPersonCtx[]
  memories: AskMemoryHit[]
  goals: AskGoalCtx[]
}

function fmtScore(p: AskPersonCtx): string {
  const parts: string[] = []
  if (typeof p.scoreGlobal === 'number') parts.push(`global ${p.scoreGlobal}`)
  if (typeof p.fuerza === 'number') parts.push(`fuerza ${p.fuerza}`)
  if (typeof p.reciprocidad === 'number') parts.push(`recip ${p.reciprocidad}`)
  if (typeof p.confianza === 'number') parts.push(`confianza ${p.confianza}`)
  return parts.length ? ` · score: ${parts.join(', ')}` : ''
}

/** Arma el bloque CONTEXTO que se le pasa al modelo. Determinístico. */
export function buildAskContext(input: AskContextInput): string {
  const lines: string[] = []
  lines.push(`Hoy es ${input.todayISO}.`)
  lines.push('')

  if (input.people.length > 0) {
    lines.push('== PERSONAS ==')
    for (const p of input.people) {
      const rel = p.relationship ? ` (${p.relationship})` : ''
      const org = p.organization ? ` · ${p.organization}` : ''
      const last = p.lastContact ? ` · último contacto ${p.lastContact.slice(0, 10)}` : ' · sin contacto registrado'
      lines.push(`# ${p.name}${rel}${org}${last}${fmtScore(p)}`)
      if (p.activeGoal) lines.push(`  objetivo ligado: ${p.activeGoal}`)
      if (p.recentMemories.length > 0) {
        lines.push('  notas recientes:')
        for (const m of p.recentMemories.slice(0, 12)) lines.push(`   - ${m}`)
      } else {
        lines.push('  (sin notas registradas)')
      }
      lines.push('')
    }
  }

  if (input.memories.length > 0) {
    lines.push('== MEMORIAS RELEVANTES (búsqueda) ==')
    for (const m of input.memories.slice(0, 12)) {
      const who = m.personName ? `[${m.personName}] ` : ''
      const when = m.occurredAt ? ` (${m.occurredAt.slice(0, 10)})` : ''
      lines.push(`- ${who}${m.content}${when}`)
    }
    lines.push('')
  }

  if (input.goals.length > 0) {
    lines.push('== OBJETIVOS ACTIVOS ==')
    for (const g of input.goals.slice(0, 20)) {
      const na = g.nextAction ? ` · próximo paso: ${g.nextAction}` : ''
      lines.push(`- ${g.title}${na}`)
    }
    lines.push('')
  }

  if (input.people.length === 0 && input.memories.length === 0 && input.goals.length === 0) {
    lines.push('(No se encontró data relacionada con la pregunta.)')
  }

  lines.push('== PREGUNTA ==')
  lines.push(input.question)
  return lines.join('\n')
}

/** Normaliza para match: minúsculas, sin tildes. */
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Devuelve los nombres conocidos mencionados en la pregunta (match por primer
 * nombre o nombre completo, insensible a tildes/mayúsculas). Acota a `max`.
 * Sirve para resolver de qué persona(s) habla la pregunta.
 */
export function extractCandidateNames(question: string, knownNames: readonly string[], max = 5): string[] {
  const q = norm(question)
  const hits: Array<{ name: string; len: number }> = []
  for (const full of knownNames) {
    if (!full) continue
    const first = norm(full).split(/\s+/)[0]
    const nf = norm(full)
    if (first.length >= 3 && new RegExp(`\\b${first}\\b`).test(q)) {
      hits.push({ name: full, len: first.length })
    } else if (nf.length >= 3 && q.includes(nf)) {
      hits.push({ name: full, len: nf.length })
    }
  }
  // Más largos primero (match más específico), dedupe por nombre.
  const seen = new Set<string>()
  return hits
    .sort((a, b) => b.len - a.len)
    .map((h) => h.name)
    .filter((n) => (seen.has(n) ? false : (seen.add(n), true)))
    .slice(0, max)
}
