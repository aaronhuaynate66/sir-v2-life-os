// SIR V2 — SIR conversacional (#86) · PR1 SOLO LECTURA.
// Módulo puro: prompt de sistema + ensamblado de contexto aterrizado + matcher
// de nombres. Sin side effects → testeable. La ruta /api/sir/ask hace el
// retrieval (personas, memorias, objetivos) y le pasa todo a buildAskContext.
//
// Pilar de diseño: GROUNDING. El modelo responde SOLO con la data provista.
// Si algo no está, dice "no tengo registro" en vez de inventar — porque
// alucinar sobre personas reales que a Aaron le importan rompe la confianza
// en todo SIR. v1 NO escribe nada (las acciones llegan en una fase posterior).

import type { Memory } from '@/types'

export const SIR_ASK_SYSTEM_PROMPT = `Eres SIR, el sistema de inteligencia relacional de Aaron. Respondes como un asesor cercano, breve y directo.

IDIOMA (REGLA INQUEBRANTABLE — SIEMPRE, sin excepción):
- Escribes SIEMPRE en español del Perú (peruano neutro, de Lima). Tuteo con "tú": "tú puedes", "tienes", "eres", "dime", "hazlo", "quieres", "mira".
- PROHIBIDO el voseo y cualquier giro argentino/rioplatense: nada de "vos", "sos", "tenés", "querés", "podés", "decime", "mirá", "ponételo"/"ponete", "fijate", "acá"/"allá" (usa "aquí"/"allí"), ni muletillas como "che", "dale", "boludo", "posta", "laburo". Los imperativos van en tuteo peruano: "ponlo" (no "ponételo"), "fíjate" (no "fijate"), "escríbele" (no "escribile"), "mándale" (no "mandale"). Si te sale una, corrígela antes de responder.
- Vocabulario y giros naturales del Perú. Registro cálido y natural, nunca acartonado, pero siempre peruano.

REGLAS DURAS:
- Usa ÚNICAMENTE la data del bloque CONTEXTO. No inventes hechos, fechas, nombres ni números.
- Si la respuesta no está en el contexto, dilo sin rodeos ("No tengo registro de eso") y, si quieres, sugiere cómo cargarlo. NUNCA rellenes con suposiciones disfrazadas de hechos.
- Cuando afirmes algo, que se note de dónde sale (la persona, una memoria, un objetivo).
- Puedes proponer accionables concretos, pero márcalos como SUGERENCIA, no como algo ya hecho. v1 no ejecuta acciones.
- No moralices ni adornes. Pocas palabras, alto valor.
- Si la pregunta es sobre cómo acercarte a alguien, básate en su último contacto, su score y lo que sabes de la relación; sé específico y realista.

CICLO MENSTRUAL (cuando el CONTEXTO trae la fase del ciclo de una persona — dato sensible, sobre todo de tu pareja):
- Úsala SOLO para sintonizarte y cuidar mejor: timing, suavidad, presencia, anticipación amable. Puedes decir en qué fase está y qué tiende a pasar en esa fase, siempre como CUIDADO.
- NUNCA la uses para descalificar ("está hormonal"), invalidar lo que siente, ni predecir su conducta como si fuera un mecanismo. El ciclo MODULA, no dicta: una emoción real es real, tenga la fase que tenga; es contexto, jamás la explicación única.
- Es tendencia poblacional, no ley individual. Habla de posibilidades de cuidado, no de certezas conductuales. Si te piden "probabilidades de comportamiento" por la fase, reencuádralo hacia cómo acompañar mejor, sin reducir a la persona a su biología.
- Si NO hay fecha exacta de ciclo pero el CONTEXTO trae una "ventana conductual ESTIMADA de patrones de WhatsApp": úsala como TENDENCIA exploratoria (no período confirmado, no diagnóstico). Puedes decir si HOY cae dentro/cerca de una ventana de mayor sensibilidad o no, y aconsejar timing/cuidado en base a eso. SIEMPRE aclara que es una estimación de patrón de sus chats, no la regla confirmada. Si HOY NO cae en la ventana, dilo con honestidad: probablemente lo que Aaron observa no es cíclico (puede ser situacional) — no fuerces la explicación biológica.
- SI TE PREGUNTAN POR EL CICLO/LA REGLA DE UNA PERSONA Y NO HAY NI FECHA EXACTA NI VENTANA CONDUCTUAL ESTIMADA en el contexto: dilo con honestidad — no tienes ese dato para ELLA, no puedes calcularlo. NO inventes la fase, NO la deduzcas, y JAMÁS uses el ciclo de otra persona con nombre parecido (ej. otra "Diana"). Explica que hace falta o registrar la fecha de su última regla en su ficha, o tener suficientes conversaciones de WhatsApp suyas para estimar el patrón.

PERSPECTIVA / ÁNIMO (solo cuando Aaron habla de cómo está, de un momento difícil, o te pide perspectiva, espejo o una idea creativa sobre su situación):
- Aquí SÍ puedes salir del modo dato seco: responde como un asesor que lo conoce y lo apoya, breve y humano.
- Primero reconoce lo que está cargando, sin minimizarlo, basándote en el CONTEXTO real (conflictos recientes, vínculos tensos, su norte). No inventes lo que no está.
- NO amplifiques lo negativo ni refuerces el discurso de derrota, naufragio o autodestrucción, aunque él lo plantee así. No le devuelvas la espiral; ofrece una mirada más completa y con agencia (sin positividad falsa ni negar lo difícil).
- ESPEJO DE FUERZA: cuando estén en el contexto, devuélvele SUS PROPIAS palabras, decisiones y avances de fortaleza (memorias, objetivos, su norte) — "tú mismo dijiste/decidiste X". Es lo más poderoso que tienes: le muestras quién es cuando está entero.
- Si te pide algo creativo (un texto, un prompt, una imagen) que sea pura derrota, ofrece una versión más honesta y con resolución antes de la más oscura; respeta su sentir pero no glorifiques el hundimiento.
- Si expresa desesperanza fuerte, que no puede más, o algo que suene a riesgo, deja la tarea y con calidez sugiérele hablarlo con alguien de confianza. No eres terapeuta ni reemplazas ayuda profesional; no lo simules.
- Sigues sin moralizar ni sermonear: pocas palabras, cálidas, verdaderas.`

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
  /** Bloque de conversación reciente importada (WhatsApp), ya renderizado. */
  conversation?: string | null
  /** Fase del ciclo menstrual (computada de cycle_start_date). Dato SENSIBLE:
   *  para cuidar/atunarse, nunca para descalificar (ver doc 17). null si no aplica. */
  cycle?: {
    label: string
    cycleDay: number
    cycleLength: number
    daysUntilNextPeriod: number
    isPmsWindow: boolean
    isFertileWindow: boolean
    note: string
  } | null
  /** Ventana conductual estimada de PATRONES de WhatsApp (forecast-conductual,
   *  exploratorio, SIN fecha manual). Es TENDENCIA — no período confirmado ni
   *  diagnóstico. Se usa cuando no hay `cycle` (fecha exacta). null si no hay
   *  data/forecast. Ver src/lib/forecast-conductual. */
  behaviorWindow?: {
    periodDays: number | null
    mainStart: string | null
    mainEnd: string | null
    confidenceLabel: string
    inWindowNow: boolean
    daysToWindow: number | null
  } | null
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
  /** El norte del año (goals.is_anchor). Se marca aparte para que el chat
   *  aterrice sus respuestas en la brújula, no en un objetivo cualquiera. */
  isAnchor?: boolean | null
}

export interface AskContextInput {
  question: string
  todayISO: string
  people: AskPersonCtx[]
  memories: AskMemoryHit[]
  /** Tus propias palabras/momentos de fuerza (modo perspectiva). */
  strengths?: string[]
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
      if (p.conversation && p.conversation.trim()) {
        lines.push('  ' + p.conversation.trim().slice(0, 3000).replace(/\n/g, '\n  '))
      }
      if (p.cycle) {
        const c = p.cycle
        const until = c.daysUntilNextPeriod === 0 ? 'período estimado hoy' : `~${c.daysUntilNextPeriod} día(s) para el próximo período`
        lines.push('  ciclo menstrual (dato SENSIBLE — para atunarte y cuidar, NUNCA para descalificar ni predecir su conducta):')
        lines.push(`   - fase actual: ${c.label} (día ${c.cycleDay}/${c.cycleLength}) · ${until}`)
        if (c.isPmsWindow) lines.push('   - ventana premenstrual: puede haber más sensibilidad — presencia y suavidad suman')
        if (c.isFertileWindow) lines.push('   - ventana fértil (orientativa, NO método anticonceptivo)')
        lines.push(`   - tendencia típica de la fase: ${c.note} (tendencia poblacional, NO certeza; estimado desde la última fecha de período, asume ciclo regular)`)
      } else if (p.behaviorWindow) {
        const b = p.behaviorWindow
        lines.push('  ventana conductual ESTIMADA de patrones de WhatsApp (dato SENSIBLE — TENDENCIA exploratoria, NO período confirmado ni diagnóstico; jamás para descalificar):')
        if (b.inWindowNow) {
          lines.push(`   - HOY cae dentro de una ventana estimada de mayor sensibilidad/fricción (ritmo ~${b.periodDays}d, confianza ${b.confidenceLabel})`)
        } else if (b.daysToWindow != null && b.daysToWindow >= 0) {
          lines.push(`   - HOY NO está en la ventana estimada; la próxima ventana sensible sería en ~${b.daysToWindow} día(s) (${b.mainStart} → ${b.mainEnd}, ritmo ~${b.periodDays}d, confianza ${b.confidenceLabel})`)
        } else {
          lines.push(`   - ventana estimada: ${b.mainStart} → ${b.mainEnd} (ritmo ~${b.periodDays}d, confianza ${b.confidenceLabel})`)
        }
        lines.push('   - úsalo SOLO para timing/cuidado (cuándo encarar un tema, cuándo dar aire). Aclara que es estimación de PATRÓN de sus chats, NO la regla confirmada; se afina registrando qué pasa. Si HOY no cae en la ventana, dilo: probablemente lo que ves no es cíclico.')
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
    // El norte (ancla) va primero y marcado: es la brújula del año, no un
    // objetivo más. Aterrizá las respuestas ahí cuando aplique.
    const anchor = input.goals.find((g) => g.isAnchor)
    if (anchor) {
      const na = anchor.nextAction ? ` · próximo paso: ${anchor.nextAction}` : ''
      lines.push('== TU NORTE (el ancla del año) ==')
      lines.push(`- ${anchor.title}${na}`)
      lines.push('')
    }
    lines.push('== OBJETIVOS ACTIVOS ==')
    for (const g of input.goals.slice(0, 20)) {
      if (g.isAnchor) continue // ya listado arriba como norte
      const na = g.nextAction ? ` · próximo paso: ${g.nextAction}` : ''
      lines.push(`- ${g.title}${na}`)
    }
    lines.push('')
  }

  if (input.people.length === 0 && input.memories.length === 0 && input.goals.length === 0) {
    lines.push('(No se encontró data relacionada con la pregunta.)')
  }

  if (input.strengths && input.strengths.length > 0) {
    lines.push('== TUS PROPIAS PALABRAS DE FUERZA (para el espejo; citá estas cuando lo banques) ==')
    for (const sgth of input.strengths.slice(0, 6)) lines.push(`- "${sgth}"`)
    lines.push('')
  }

  lines.push('== PREGUNTA ==')
  lines.push(input.question)
  return lines.join('\n')
}

/** Un "recibo" del chat: una memoria REAL que alimentó la respuesta, con su
 *  persona y origen. La UI deriva la confianza con memoryProvenance. */
export interface SirReceipt {
  person: string
  text: string
  source: Memory['source']
}

/**
 * Arma los recibos del chat: las memorias reales inyectadas al contexto (con su
 * origen), para que Aaron VEA sobre qué se paró SIR y pueda verificar. NO las
 * genera el modelo → no se pueden alucinar (a diferencia de una cita inline que
 * el LLM podría inventar). Toma hasta `perPerson` por persona, dedupe por texto,
 * cap total. PURO.
 */
export function buildReceipts(
  people: { name: string; memories: { content: string; source?: Memory['source'] }[] }[],
  opts: { perPerson?: number; cap?: number } = {},
): SirReceipt[] {
  const perPerson = opts.perPerson ?? 3
  const cap = opts.cap ?? 6
  const out: SirReceipt[] = []
  const seen = new Set<string>()
  for (const p of people) {
    let n = 0
    for (const m of p.memories) {
      const text = (m.content ?? '').trim()
      if (!text) continue
      const key = text.toLowerCase().slice(0, 120)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ person: p.name, text: text.slice(0, 240), source: m.source })
      if (out.length >= cap) return out
      if (++n >= perPerson) break
    }
  }
  return out
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
  interface Hit { name: string; first: string; len: number; specific: boolean }
  const hits: Hit[] = []
  for (const full of knownNames) {
    if (!full) continue
    const tokens = norm(full).split(/\s+/).filter(Boolean)
    if (tokens.length === 0) continue
    const first = tokens[0]
    const nf = norm(full)
    const fullHit = nf.length >= 3 && q.includes(nf)
    const firstHit = first.length >= 3 && new RegExp(`\\b${first}\\b`).test(q)
    if (!fullHit && !firstHit) continue
    // "Específico": matcheó el nombre completo, o el primer nombre + al menos otro
    // token del nombre (ej. "Diana Díaz"). Distingue del match por primer nombre solo.
    const otherTokenHit = tokens.slice(1).some((t) => t.length >= 3 && new RegExp(`\\b${t}\\b`).test(q))
    const specific = fullHit || (firstHit && otherTokenHit)
    hits.push({ name: full, first, len: fullHit ? nf.length : first.length, specific })
  }
  // DOS DIANAS: si un primer nombre tiene un match ESPECÍFICO (nombre completo o
  // con apellido), suprimí los matches por-primer-nombre-solo de OTRAS personas
  // que comparten ese primer nombre — no las arrastres por la homonimia.
  const specificFirsts = new Set(hits.filter((h) => h.specific).map((h) => h.first))
  const filtered = hits.filter((h) => h.specific || !specificFirsts.has(h.first))
  // Específicos primero, luego más largos; dedupe por nombre.
  const seen = new Set<string>()
  return filtered
    .sort((a, b) => (Number(b.specific) - Number(a.specific)) || (b.len - a.len))
    .map((h) => h.name)
    .filter((n) => (seen.has(n) ? false : (seen.add(n), true)))
    .slice(0, max)
}


// ─── ESPEJO DE FUERZA (modo perspectiva) ────────────────────────────────────
const PERSPECTIVE_KW = [
  'como estoy', 'como me siento', 'me siento', 'no doy mas', 'no puedo mas',
  'no aguanto', 'estoy mal', 'estoy hecho', 'bajon', 'bajoneado', 'triste',
  'perdido', 'hundido', 'hundiendo', 'naufrag', 'me ahogo', 'ahogad',
  'perspectiva', 'animo', 'agotado', 'cansado', 'abrumado', 'colaps',
  'no se que hacer con mi vida', 'estoy quemado', 'quemandome', 'sin fuerzas',
  'me supera', 'todo junto', 'no puedo con',
]

/** ¿La consulta es sobre cómo está / pide perspectiva o ánimo? */
export function isPerspectiveQuery(question: string): boolean {
  const q = (question || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return PERSPECTIVE_KW.some((k) => q.includes(k))
}

const STRENGTH_KW = [
  'puedo con todo', 'siempre puedo', 'sali adelante', 'salir adelante',
  'lo volvere a hacer', 'lo volvi a hacer', 'campeon', 'gane', 'ganare',
  'logre', 'logr', 'consegui', 'orgullo', 'fuerte', 'fuerza', 'no me rindo',
  'no me rendi', 'resilien', 'voluntad', 'soy capaz', 'capaz de', 'determinaci',
  'esfuerzo', 'levantarme', 'me levante', 'supere', 'superar', 'puse de pie',
]

/** Selecciona memorias que reflejan FORTALEZA del usuario (sus propias palabras
 *  de cuando estuvo entero). Filtra por léxico de fuerza; más recientes primero.
 *  PURO. */
export function selectStrengthMemories(
  memories: { content: string; occurredAt?: string | null }[],
  limit = 5,
): string[] {
  const seen = new Set<string>()
  const out: { content: string; at: string }[] = []
  for (const m of memories) {
    const c = (m.content || '').trim()
    if (!c) continue
    const norm = c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    if (!STRENGTH_KW.some((k) => norm.includes(k))) continue
    const key = norm.slice(0, 60)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ content: c.slice(0, 240), at: m.occurredAt ?? '' })
  }
  out.sort((a, b) => (b.at || '').localeCompare(a.at || ''))
  return out.slice(0, limit).map((x) => x.content)
}
