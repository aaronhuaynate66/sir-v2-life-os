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
- BREVEDAD: si Aaron pide algo CORTO ("dame un consejo corto", "en una línea", "rápido"), responde en 1-3 frases y NO acumules datos que no pidió. La concisión es respeto por su tiempo.

REGLAS DURAS:
- Responde EXACTAMENTE lo que Aaron preguntó. Si algo es ambiguo (a qué se refiere con "esas personas", "eso", "esto"), y el CONTEXTO no lo aclara, PREGÚNTALE en una línea en vez de asumir o irte por las ramas hacia otro tema. Mejor una repregunta corta que una respuesta segura sobre algo que no preguntó.
- Usa ÚNICAMENTE la data del bloque CONTEXTO. No inventes hechos, fechas, nombres ni números.
- Si un DATO puntual no está en el CONTEXTO de este turno, dilo sin rodeos ("no tengo ese dato a la mano ahora") y, si quieres, sugiere cómo cargarlo o pídelo. Pero DISTINGUE dos cosas muy distintas: (a) "esa INTEGRACIÓN/capacidad no existe" — JAMÁS lo digas de ninguna fuente listada en INTEGRACIONES Y FUENTES (más abajo): esas SÍ existen aunque su data no siempre venga en este turno; y (b) "ese dato puntual no me lo pasaron en este turno" — eso sí puedes y debes decirlo. Si te preguntan por una de esas fuentes, confírmala y di qué haría falta para traer el dato; NUNCA la niegues. NUNCA rellenes con suposiciones disfrazadas de hechos.
- Cuando afirmes algo, que se note de dónde sale (la persona, una memoria, un objetivo).
- Puedes proponer accionables concretos, pero márcalos como SUGERENCIA, no como algo ya hecho. v1 no ejecuta acciones.
- No moralices ni adornes. Pocas palabras, alto valor.
- Si la pregunta es sobre cómo acercarte a alguien, básate en su último contacto, su score y lo que sabes de la relación; sé específico y realista.

INTEGRACIONES Y FUENTES QUE EXISTEN EN SIR (aunque no siempre estén en este contexto — NUNCA niegues tenerlas):
- Reader social propio de Instagram y LinkedIn (posts, historias/stories y close-friends de las cuentas de Aaron) → sobre todo para TIMING (ej. "le vi una historia hoy, buen momento para escribirle").
- WhatsApp importado y consolidado (chats, notas de voz transcritas) → las conversaciones reales con su gente.
- Salud y báscula: peso y composición corporal, sueño (duración, score, fases, despertares), frecuencia cardíaca (FC), variabilidad (VFC/HRV), saturación (SpO₂) y frecuencia respiratoria.
- Calendario: Google (personal) + Outlook (laboral).
- Forecast conductual: patrones de WhatsApp → ventanas estimadas de mayor sensibilidad/fricción.
- Ciclo menstrual (cuando hay fecha registrada de una persona).
- Recordatorios: los agendas Y los lees (pendientes con fecha/hora).
- Objetivos, hitos y el NORTE del año.
- Deals / oportunidades del pipeline comercial (etapa, monto, próxima acción, cliente).
- Índice de Afecto Expresado (cariño en los chats).
- Alertas de tensión relacional (cuando un vínculo se enfría o se tensa).
Si te preguntan "¿qué puedes hacer?" o por una de estas fuentes, respóndelo con seguridad y en concreto. Si el DATO puntual no vino en este turno, dilo ("no lo tengo a la mano ahora, mándamelo / cárgalo y lo veo") pero SIN negar la capacidad.

PROACTIVIDAD — CIERRA EL LOOP (no seas pasivo):
- Si en el CONTEXTO o en tu propia respuesta aparece un COMPROMISO DATABLE (un examen, reunión, entrega, trámite, viaje con fecha/hora concreta), NO te quedes en "¿necesitas seguimiento?". PROPÓN agendarlo: usa la herramienta de recordatorio con la fecha/hora REALES del contexto (nunca inventes la fecha; si falta, propón con la que haya o pregunta cuál). Sigue siendo una SUGERENCIA (Aaron confirma), no algo ya hecho.
- Si ese compromiso o paso AVANZA su norte (el objetivo-ancla del año), dilo explícito y conéctalo: "agendarlo es un paso menos para <su norte>". Tienes el dato de la conexión — úsalo, no lo dejes en el aire.
- Regla de oro: si tienes lo necesario para OFRECER una acción concreta y útil, ofrécela; no te limites a describir y preguntar. Computar el dato y no proponer nada es quedarte corto.

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

// ─── DETECCIÓN DE INTENCIÓN (gating de bloques nuevos) ───────────────────────
// Normaliza (minúsculas, sin tildes) y busca cualquier keyword como substring.
// Las keywords se eligen distintivas (evitamos 2-letras ambiguas como "fc").
function matchesAny(question: string, keywords: readonly string[]): boolean {
  const q = (question || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return keywords.some((k) => q.includes(k))
}

const HEALTH_KW = [
  'salud', 'como dormi', 'dormi', 'sueno', 'descans', 'peso', 'bascula',
  'composicion corporal', 'vfc', 'hrv', 'spo2', 'saturacion', 'oxigeno',
  'energia', 'cansad', 'agotad', 'pulso', 'cardiac', 'frecuencia cardi',
  'ritmo cardi', 'despertares', 'grasa corporal', 'masa muscular',
] as const
/** ¿La pregunta es sobre salud/sueño/peso/FC/VFC/SpO₂? */
export function isHealthQuery(question: string): boolean {
  return matchesAny(question, HEALTH_KW)
}

const REMINDER_KW = [
  'recordatorio', 'recuerdame', 'recuerda me', 'recordar', 'me recuerdas',
  'pendiente', 'pendientes', 'agenda', 'agendado', 'por hacer', 'que tengo que hacer',
  'que debo hacer', 'me falta hacer', 'tengo que hacer', 'tareas pendientes',
] as const
/** ¿La pregunta es sobre recordatorios/pendientes/agenda? */
export function isReminderQuery(question: string): boolean {
  return matchesAny(question, REMINDER_KW)
}

const DEAL_KW = [
  'deal', 'deals', 'oportunidad', 'oportunidades', 'pipeline', 'venta', 'ventas',
  'vender', 'cliente', 'clientes', 'negocio', 'negocios', 'licitacion',
  'propuesta comercial', 'cotizacion', 'cierre', 'prospecto', 'prospectos',
] as const
/** ¿La pregunta es sobre deals/oportunidades/pipeline/venta/cliente? */
export function isDealQuery(question: string): boolean {
  return matchesAny(question, DEAL_KW)
}

const TENSION_KW = [
  'tension', 'tenso', 'tensa', 'distante', 'distanciad', 'alejad', 'enfriad',
  'frio con', 'fria con', 'mal con', 'pelead', 'conflicto', 'alerta de relacion',
  'relacion tensa', 'quien esta mal', 'como estan mis', 'vinculos tensos',
] as const
/** ¿La pregunta es sobre tensión/distancia relacional? */
export function isTensionQuery(question: string): boolean {
  return matchesAny(question, TENSION_KW)
}

// ─── SALUD RECIENTE (valores reales) ─────────────────────────────────────────
/** Etiquetas legibles + orden de display para las métricas de health_metrics que
 *  surfaceamos (peso, FC/VFC/SpO₂ del día y del sueño). El resto no se muestra. */
const HEALTH_METRIC_LABELS: Array<{ type: string; label: string }> = [
  { type: 'weight', label: 'Peso' },
  { type: 'heart_rate_min', label: 'FC mínima' },
  { type: 'heart_rate_max', label: 'FC máxima' },
  { type: 'sleeping_heart_rate', label: 'FC en reposo (sueño)' },
  { type: 'hrv_avg', label: 'VFC promedio (HRV)' },
  { type: 'hrv_min', label: 'VFC mínima' },
  { type: 'hrv_max', label: 'VFC máxima' },
  { type: 'blood_oxygen', label: 'SpO₂' },
  { type: 'respiratory_rate', label: 'Frec. respiratoria' },
]

export interface HealthMetricReading {
  type: string
  value: number
  unit?: string | null
  measuredAt: string
}
export interface SleepReading {
  date: string
  duration: number
  quality?: number | null
  score?: number | null
  awakenings?: number | null
}
export interface HealthSnapshot {
  sleep: SleepReading | null
  metrics: Array<{ label: string; value: number; unit: string; day: string }>
}

/** Duración en horas decimales → "7h15" / "8h" (formato humano). */
function fmtSleepDuration(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '—'
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

/**
 * Selecciona las últimas lecturas de salud para el prompt: la última noche de
 * sueño + la lectura más reciente de cada métrica curada (peso, FC/VFC/SpO₂).
 * PURO. Asume que las filas de métricas vienen ordenadas por fecha DESC (toma la
 * primera coincidencia de cada tipo); las de sueño, la más reciente. */
export function selectRecentHealth(
  metricRows: HealthMetricReading[],
  sleepRows: SleepReading[],
): HealthSnapshot {
  const sleep = sleepRows.length > 0
    ? [...sleepRows].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0]
    : null

  const sortedMetrics = [...metricRows].sort((a, b) => (b.measuredAt || '').localeCompare(a.measuredAt || ''))
  const metrics: HealthSnapshot['metrics'] = []
  for (const { type, label } of HEALTH_METRIC_LABELS) {
    const hit = sortedMetrics.find((r) => r.type === type && Number.isFinite(Number(r.value)))
    if (!hit) continue
    metrics.push({
      label,
      value: Number(hit.value),
      unit: (hit.unit ?? '').trim(),
      day: (hit.measuredAt || '').slice(0, 10),
    })
  }
  return { sleep, metrics }
}

/** Bloque "== SALUD RECIENTE ==" con valores reales. '' si no hay data. */
export function renderHealthBlock(snap: HealthSnapshot): string {
  if (!snap.sleep && snap.metrics.length === 0) return ''
  const lines: string[] = ['== SALUD RECIENTE (valores reales; cítalos, no digas que no tienes salud) ==']
  if (snap.sleep) {
    const s = snap.sleep
    const parts = [`duró ${fmtSleepDuration(s.duration)}`]
    if (typeof s.score === 'number') parts.push(`score ${s.score}/100`)
    else if (typeof s.quality === 'number') parts.push(`calidad ${s.quality}/10`)
    if (typeof s.awakenings === 'number') parts.push(`${s.awakenings} despertar${s.awakenings === 1 ? '' : 'es'}`)
    lines.push(`- Sueño (${s.date}): ${parts.join(' · ')}`)
  }
  for (const m of snap.metrics) {
    const unit = m.unit ? ` ${m.unit}` : ''
    lines.push(`- ${m.label}: ${m.value}${unit} (${m.day})`)
  }
  return lines.join('\n')
}

// ─── RECORDATORIOS PENDIENTES ────────────────────────────────────────────────
export interface ReminderRow {
  text: string
  dueAt: string
  personName?: string | null
}
/** Bloque "== RECORDATORIOS PENDIENTES ==". '' si no hay. `today` = YYYY-MM-DD. */
export function renderRemindersBlock(reminders: ReminderRow[], today: string): string {
  if (reminders.length === 0) return ''
  const lines: string[] = ['== RECORDATORIOS PENDIENTES (los tienes agendados; puedes listarlos) ==']
  for (const r of reminders.slice(0, 15)) {
    const day = (r.dueAt || '').slice(0, 10)
    const rel = day ? ` (${relativeDueLabel(day, today)})` : ''
    const who = r.personName ? ` · ${r.personName}` : ''
    lines.push(`- ${r.text}${who} — vence ${day}${rel}`)
  }
  return lines.join('\n')
}

/** Etiqueta relativa de vencimiento entre dos YYYY-MM-DD ("hoy"/"vencido…"/"en N días"). */
function relativeDueLabel(day: string, today: string): string {
  const [ay, am, ad] = day.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  if (![ay, am, ad, ty, tm, td].every(Number.isFinite)) return day
  const diff = Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(ty, tm - 1, td)) / 86_400_000)
  if (diff === 0) return 'hoy'
  if (diff === 1) return 'mañana'
  if (diff < 0) return `vencido hace ${Math.abs(diff)} día${diff === -1 ? '' : 's'}`
  return `en ${diff} días`
}

// ─── OPORTUNIDADES / DEALS ───────────────────────────────────────────────────
export interface DealRow {
  title: string
  stage?: string | null
  amount?: number | null
  currency?: string | null
  nextAction?: string | null
  nextActionDate?: string | null
  closeWindow?: string | null
  contactName?: string | null
}
/** Bloque "== OPORTUNIDADES ==" con deals abiertos. '' si no hay. */
export function renderDealsBlock(deals: DealRow[]): string {
  if (deals.length === 0) return ''
  const lines: string[] = ['== OPORTUNIDADES ABIERTAS (pipeline comercial; puedes listarlas) ==']
  for (const d of deals.slice(0, 15)) {
    const bits: string[] = []
    if (d.stage) bits.push(`etapa ${d.stage}`)
    if (typeof d.amount === 'number' && Number.isFinite(d.amount)) {
      bits.push(`${d.currency ?? ''} ${d.amount}`.trim())
    }
    if (d.contactName) bits.push(`contacto ${d.contactName}`)
    if (d.nextAction) {
      const when = d.nextActionDate ? ` (${d.nextActionDate.slice(0, 10)})` : ''
      bits.push(`próxima acción: ${d.nextAction}${when}`)
    } else if (d.closeWindow) {
      bits.push(`cierre: ${d.closeWindow}`)
    }
    lines.push(`- ${d.title}${bits.length ? ' · ' + bits.join(' · ') : ''}`)
  }
  return lines.join('\n')
}

// ─── ALERTAS DE TENSIÓN RELACIONAL ───────────────────────────────────────────
export interface TensionAlertRow {
  personName?: string | null
  fromLabel?: string | null
  toLabel?: string | null
  message: string
  createdAt?: string | null
}
/** Bloque "== ALERTAS DE TENSIÓN ==". '' si no hay. */
export function renderTensionAlertsBlock(alerts: TensionAlertRow[]): string {
  if (alerts.length === 0) return ''
  const lines: string[] = ['== ALERTAS DE TENSIÓN RELACIONAL (vínculos que se enfriaron o tensaron) ==']
  for (const a of alerts.slice(0, 12)) {
    const who = a.personName ? `${a.personName}: ` : ''
    const when = a.createdAt ? ` (${a.createdAt.slice(0, 10)})` : ''
    lines.push(`- ${who}${a.message}${when}`)
  }
  return lines.join('\n')
}
