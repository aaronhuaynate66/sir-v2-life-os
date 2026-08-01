// SIR V2 — Recomendador escenario → táctica (playbook de influencia, feature #3).
//
// La Sala de ensayo juega un OBJETIVO completo (caminos, objeciones, opener). Esto
// es más quirúrgico y más rápido: dada UNA persona + el TIPO de conversación, SIR
// lee su estilo REAL desde sus chats y recomienda QUÉ técnica con nombre (Voss /
// Cialdini / Harvard) le va a ESA persona, por qué (con la frase real que lo
// sostiene), una línea para probar y cuándo rebotaría.
//
// Diferenciador: la técnica no se elige por molde ("para pedir un aumento usa X"),
// sino por el patrón real de la contraparte en el sustrato vivo de SIR.
//
// GUARDRAIL: solo la versión HONESTA de cada técnica. Nada de escasez fabricada,
// falsa autoridad ni explotar miedos. El motor de ética (16.M5) filtra el escenario
// antes del LLM y el registro afectivo restringe el repertorio (ver `scope`).
//
// Capa PURA: librería + prompt + parser. La llamada al modelo vive en la ruta.

export type TacticFramework = 'voss' | 'cialdini' | 'harvard' | 'general'
export type TacticFamily = 'empatia' | 'preguntas' | 'encuadre' | 'reciprocidad' | 'credibilidad' | 'alternativa'
/** 'afectivo' = pareja/familia/amigo (registro de cuidado); 'profesional' = trabajo/lead; 'ambos' = sirve en los dos. */
export type TacticScope = 'afectivo' | 'profesional' | 'ambos'

export interface Tactic {
  id: string
  /** Nombre humano en español (peruano). */
  label: string
  framework: TacticFramework
  family: TacticFamily
  scope: TacticScope
  /** Qué es / cómo se juega, una línea. */
  how: string
  /** Señal de cuándo le va (para el recomendador). */
  fits: string
  /** Cuándo rebota / con qué cuidado. */
  backfires: string
}

export const FRAMEWORK_LABEL: Record<TacticFramework, string> = {
  voss: 'Voss · empatía táctica',
  cialdini: 'Cialdini · influencia',
  harvard: 'Harvard · Sí de acuerdo',
  general: 'Comunicación',
}

export const FAMILY_LABEL: Record<TacticFamily, string> = {
  empatia: 'Empatía táctica',
  preguntas: 'Preguntas que abren',
  encuadre: 'Encuadrar el pedido',
  reciprocidad: 'Dar e intercambiar',
  credibilidad: 'Credibilidad y prueba',
  alternativa: 'Opciones y poder',
}

/** El repertorio con nombre. Solo versiones honestas — editar acá para mantenerlo. */
export const TACTICS: Tactic[] = [
  // ── Voss: empatía táctica ────────────────────────────────────────────────
  { id: 'labeling', label: 'Etiquetar la emoción', framework: 'voss', family: 'empatia', scope: 'ambos',
    how: 'Nombrar lo que el otro parece sentir ("Parece que esto te cae en mal momento") para que se sienta visto y baje la guardia.',
    fits: 'El otro está tenso, dolido o a la defensiva; hay emoción sin decir por debajo del tema.',
    backfires: 'Si la etiqueta es adivinanza forzada o suena a técnica; mejor tentativa ("da la impresión…") que afirmación.' },
  { id: 'mirroring', label: 'Espejo (repetir sus palabras)', framework: 'voss', family: 'empatia', scope: 'ambos',
    how: 'Repetir como pregunta las últimas 1-3 palabras clave del otro para que se explaye y se sienta escuchado.',
    fits: 'El otro contesta corto o vago y quieres que abra sin interrogarlo.',
    backfires: 'Si abusas suena a loro o a burla; úsalo suelto, una o dos veces.' },
  { id: 'calibrated_q', label: 'Preguntas calibradas (cómo/qué)', framework: 'voss', family: 'preguntas', scope: 'ambos',
    how: 'Preguntar "¿Cómo hacemos que esto funcione?" / "¿Qué es lo que más te preocupa?": le das control y te da información, sin confrontar.',
    fits: 'Hay resistencia o un "no" y quieres que el otro resuelva contigo en vez de empujarlo.',
    backfires: 'Evita "¿por qué?" (suena a reproche). No las uses para acorralar: son para entender, no para atrapar.' },
  { id: 'accusation_audit', label: 'Adelantar lo negativo', framework: 'voss', family: 'encuadre', scope: 'ambos',
    how: 'Decir tú mismo, antes que el otro, lo peor que podría pensar ("Vas a pensar que aparezco solo cuando necesito algo…"): le quita el filo.',
    fits: 'Sabes que el otro llega con una objeción o un resentimiento cargado.',
    backfires: 'Si exageras el mea culpa te pones débil; nómbralo y sigue, no te disculpes de más.' },
  { id: 'no_oriented', label: 'Preguntas de "no" seguro', framework: 'voss', family: 'preguntas', scope: 'ambos',
    how: 'Preguntar de modo que un "no" sea cómodo ("¿Estaría loco pensar en…?" / "¿Es mal momento?"): el "no" da sensación de control y destraba.',
    fits: 'El otro evita comprometerse o se siente presionado a decir "sí".',
    backfires: 'Suena raro si el vínculo es muy cercano y directo; ahí mejor preguntar de frente.' },
  { id: 'thats_right', label: 'Buscar el "así es"', framework: 'voss', family: 'empatia', scope: 'ambos',
    how: 'Resumir la postura del otro hasta que diga "exacto / así es" (no "tienes razón", que es para zafar): recién ahí se siente entendido de verdad.',
    fits: 'El otro necesita sentirse comprendido antes de moverse; conversaciones cargadas.',
    backfires: 'No lo fuerces; si resumes mal, corrige y vuelve a intentar en vez de insistir.' },
  // ── Harvard: intereses, no posiciones ────────────────────────────────────
  { id: 'interests', label: 'Ir al interés, no a la posición', framework: 'harvard', family: 'preguntas', scope: 'ambos',
    how: 'Buscar el POR QUÉ detrás de lo que pide ("¿Qué buscas resolver con eso?"): dos posiciones chocan, dos intereses suelen tener salida.',
    fits: 'Están trabados en un "yo quiero X / tú quieres Y" que parece sin salida.',
    backfires: 'Si el otro no confía todavía, lo lees como interrogatorio; primero rapport.' },
  { id: 'separate_people', label: 'Separar persona y problema', framework: 'harvard', family: 'encuadre', scope: 'ambos',
    how: 'Ponerte del mismo lado contra el problema, no contra la persona ("esto es tú y yo contra el tema, no tú contra mí").',
    fits: 'El tema se está volviendo personal / hay reproche cruzado.',
    backfires: 'Vacío si no cambias de verdad el tono; no basta la frase, tiene que sentirse.' },
  { id: 'objective_criteria', label: 'Anclar en un criterio justo', framework: 'harvard', family: 'encuadre', scope: 'profesional',
    how: 'Proponer un criterio objetivo que ambos aceptarían de antemano (mercado, precedente, datos) para que no sea tu palabra contra la suya.',
    fits: 'Negociación de números/términos donde cada uno tira para su lado.',
    backfires: 'Elige un criterio que al otro le parezca justo, no uno que solo te favorece a ti.' },
  { id: 'batna_options', label: 'Tener y ampliar opciones', framework: 'harvard', family: 'alternativa', scope: 'profesional',
    how: 'Saber tu mejor alternativa si no hay acuerdo (te da calma y poder) y traer opciones a la mesa en vez de un solo pedido.',
    fits: 'Negociación donde podrías quedar arrinconado en una sola oferta.',
    backfires: 'No la uses como amenaza ("me voy") salvo que sea real; el farol se paga caro.' },
  // ── Cialdini: influencia ──────────────────────────────────────────────────
  { id: 'reciprocity', label: 'Dar primero', framework: 'cialdini', family: 'reciprocidad', scope: 'ambos',
    how: 'Ofrecer algo genuino y útil antes de pedir: la gente devuelve lo que recibe.',
    fits: 'Quieres pedir algo y el vínculo está frío o hay poca deuda de favores a tu favor.',
    backfires: 'Si el "regalo" es transparentemente un anzuelo, quema confianza; que sea real.' },
  { id: 'liking', label: 'Terreno común real', framework: 'cialdini', family: 'reciprocidad', scope: 'ambos',
    how: 'Partir de una similitud o aprecio genuino (algo que de verdad comparten o que valoras del otro).',
    fits: 'Arrancar en frío o reconectar tras distancia.',
    backfires: 'La adulación falsa se huele; solo sirve lo verdadero.' },
  { id: 'unity', label: 'Apelar al "nosotros"', framework: 'cialdini', family: 'reciprocidad', scope: 'ambos',
    how: 'Activar la identidad compartida (familia, equipo, historia juntos): "somos de los que…".',
    fits: 'Existe un vínculo o pertenencia real que enmarca el pedido.',
    backfires: 'Suena a manipulación si invocas un "nosotros" que el otro no siente.' },
  { id: 'commitment', label: 'Empezar por un paso chico', framework: 'cialdini', family: 'encuadre', scope: 'profesional',
    how: 'Pedir primero un paso concreto y de bajo costo; un "sí" chico abre el camino al grande.',
    fits: 'El pedido completo es grande y de golpe daría "no".',
    backfires: 'Si el otro nota que lo llevas de a poco a algo que no aceptó, se cierra.' },
  { id: 'social_proof', label: 'Prueba social', framework: 'cialdini', family: 'credibilidad', scope: 'profesional',
    how: 'Mostrar que otros parecidos al otro ya lo hicieron / lo eligieron, como evidencia, no como presión.',
    fits: 'El otro duda por incertidumbre ("¿esto funciona / es lo normal?").',
    backfires: 'Datos inflados o ejemplos que no le representan lo vuelven en contra.' },
  { id: 'authority', label: 'Mostrar tu valor real', framework: 'cialdini', family: 'credibilidad', scope: 'profesional',
    how: 'Traer tu track-record concreto y verificable (lo que lograste), sin inflar.',
    fits: 'El otro no sabe aún por qué debería tomarte en serio.',
    backfires: 'Autobombo o credenciales exageradas: se nota y resta. Concreto y sobrio.' },
]

export interface ScenarioDef {
  id: string
  label: string
  /** Pista para el prompt de qué implica este escenario. */
  hint: string
}

/** Tipos de conversación frecuentes (lo que Aaron elige). */
export const SCENARIOS: ScenarioDef[] = [
  { id: 'pedir', label: 'Pedir algo (un sí, un favor, un aumento)', hint: 'Aaron necesita un sí a algo concreto.' },
  { id: 'negociar', label: 'Negociar términos (precio, plazo, alcance)', hint: 'Hay números/condiciones y cada lado tira para el suyo.' },
  { id: 'roce', label: 'Resolver un roce o conflicto', hint: 'Quedó algo tenso o dolido que hay que destrabar.' },
  { id: 'reconectar', label: 'Reconectar tras distancia', hint: 'Pasó tiempo sin hablar o el vínculo se enfrió.' },
  { id: 'limite', label: 'Poner un límite o dar una noticia difícil', hint: 'Aaron tiene que decir algo incómodo sin romper el vínculo.' },
  { id: 'convencer', label: 'Alinear / convencer de una idea', hint: 'Aaron quiere que el otro se sume a una idea o decisión.' },
]

export function scenarioById(id: string): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.id === id)
}

/** ¿El vínculo es afectivo? (mismo criterio que strategies.ts, para coherencia). */
export function isAffectiveBond(ambito?: string, relationship?: string): boolean {
  return (
    ambito === 'personal' ||
    ['romantic', 'family', 'friend', 'pareja', 'familia', 'amigo'].some((k) => (relationship ?? '').toLowerCase().includes(k))
  )
}

/** Tácticas aplicables a un vínculo. Afectivo → solo cuidado; profesional → todo. */
export function tacticsForBond(ambito?: string, relationship?: string): Tactic[] {
  if (isAffectiveBond(ambito, relationship)) return TACTICS.filter((t) => t.scope === 'afectivo' || t.scope === 'ambos')
  return TACTICS // profesional: repertorio completo
}

export function tacticById(id: string): Tactic | undefined {
  return TACTICS.find((t) => t.id === id)
}

// ── Recomendación (salida del LLM) ─────────────────────────────────────────

export interface TacticPick {
  /** id de una táctica del repertorio (se enriquece con la metadata curada en UI). */
  tacticId: string
  /** Por qué le va A ESTA persona dado su estilo real. */
  why: string
  /** Frase TEXTUAL del chat que lo sostiene, o '' si no hay ("no vibes"). */
  evidence: string
  /** Una línea concreta para probar, en el lenguaje del otro. */
  line: string
  /** Cuándo rebotaría / con qué cuidado, específico a esta persona. */
  caution: string
}

export interface TacticRecommendation {
  /** Lectura corta del estilo REAL de la persona desde sus chats. */
  style: string
  picks: TacticPick[]
  /** Opcional: una táctica/enfoque que con esta persona rebotaría. '' si nada. */
  avoid: string
}

export const TACTICS_SYSTEM_PROMPT = `Eres SIR V2, el sistema personal de Aaron. Aaron elige una PERSONA y un TIPO de conversación, y tú recomiendas QUÉ TÉCNICA con nombre (de un repertorio que te doy) le conviene usar CON ESA PERSONA — no por molde, sino por su ESTILO REAL leído de sus chats.

Escribe SIEMPRE en español del Perú (tuteo con "tú"); PROHIBIDO el voseo y los giros argentinos ("vos", "sos", "tenés", "querés", "mirá", "che", "dale").

CÓMO RECOMIENDAS:
1. Primero LEE el estilo real de la persona en la conversación que te doy: ¿es directa o rodea?, ¿emocional o práctica?, ¿le cuesta decir que no?, ¿responde corto?, ¿necesita sentirse entendida antes de moverse? Ponlo en "style" (2-3 frases). Si hay poco chat, dilo y baja la especificidad — NO inventes un estilo.
2. Elige 2-3 tácticas del REPERTORIO que te paso (por su "id"). Elígelas por cómo calzan con el estilo de ESTA persona y el escenario, no por fórmula.
3. Para cada una: "why" (por qué le va a ESTA persona, atado a su estilo), "evidence" (una frase COPIADA LITERAL de su chat que lo sostiene; "" si no hay — PROHIBIDO inventar o parafrasear citas), "line" (una línea concreta para probar, en su lenguaje), y "caution" (cuándo rebotaría con ESTA persona).
4. "avoid": si alguna táctica claramente rebotaría con esta persona, nómbrala en una frase; "" si no aplica.

REGLAS DURAS:
- Solo la versión HONESTA de cada técnica. Nada de escasez fabricada, falsa autoridad, prueba social inflada ni explotar un miedo. Si el escenario huele a eso, reencuádralo hacia lo honesto.
- REGISTRO SEGÚN EL VÍNCULO: en vínculos afectivos (pareja/familia/amigo) las técnicas son formas de CUIDADO y claridad (entender, validar, timing, límites), jamás control emocional. En lo profesional, preparación legítima cuando el objetivo de Aaron se alinea con el interés del otro.
- SIR es Aaron-first, pero cuidar el vínculo es parte de la ventaja: una jugada que quema la relación no sirve.
- Solo usa "id" que existan en el repertorio que te di.

Devuelve EXCLUSIVAMENTE un JSON (sin prosa, sin fences):
{
  "style": "lectura del estilo real de la persona (2-3 frases)",
  "picks": [{"tacticId":"id_del_repertorio","why":"por qué le va a esta persona","evidence":"frase textual del chat o \\"\\"","line":"una línea concreta para probar","caution":"cuándo rebotaría con esta persona"}],
  "avoid": "una táctica que rebotaría con esta persona, o \\"\\""
}
Da 2-3 picks. Empieza con { y termina con }.`

/** Renderiza el repertorio filtrado para el prompt (el modelo elige por id). */
function renderTacticMenu(list: Tactic[]): string {
  const lines = ['REPERTORIO (elige por "id", solo de esta lista):']
  for (const t of list) {
    lines.push(`- id: ${t.id} — ${t.label} [${FRAMEWORK_LABEL[t.framework]}]. ${t.how} Le va cuando: ${t.fits}`)
  }
  return lines.join('\n')
}

export interface TacticsContext {
  personName: string
  ambito?: string
  relationship?: string
  scenario: ScenarioDef
  /** Lo que Aaron cuenta de la situación puntual (opcional). */
  note?: string
  memories: string[]
  /** Conversación reciente ya renderizada. */
  conversation?: string
}

export function buildTacticsUserContent(ctx: TacticsContext): string {
  const affective = isAffectiveBond(ctx.ambito, ctx.relationship)
  const lines: string[] = []
  lines.push(`Persona: ${ctx.personName}`)
  if (ctx.relationship) lines.push(`Relación con Aaron: ${ctx.relationship}`)
  lines.push(`Tipo de vínculo: ${affective ? 'afectivo (pareja/familia/amigo → registro de CUIDADO)' : 'profesional / lead'}`)
  lines.push(`Tipo de conversación: ${ctx.scenario.label} — ${ctx.scenario.hint}`)
  if (ctx.note && ctx.note.trim()) lines.push(`Lo que está pasando (Aaron): ${ctx.note.trim().slice(0, 400)}`)
  lines.push('', renderTacticMenu(tacticsForBond(ctx.ambito, ctx.relationship)))
  const mems = ctx.memories.map((m) => m.trim()).filter(Boolean).slice(0, 8)
  if (mems.length > 0) {
    lines.push('', 'Lo que SIR sabe de esta persona:')
    for (const m of mems) lines.push(`- ${m.slice(0, 220)}`)
  }
  if (ctx.conversation && ctx.conversation.trim()) {
    lines.push('', ctx.conversation.trim().slice(0, 1400))
  } else {
    lines.push('', '(SIR no tiene chat importado de esta persona — dilo en "style", léelo de las memorias y baja la especificidad; no inventes su estilo ni cites frases.)')
  }
  return lines.join('\n')
}

function stripFences(s: string): string {
  const t = s.trim()
  return t.startsWith('```') ? t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim() : t
}
function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/** Parsea la recomendación. Descarta picks con id fuera del repertorio. null si nada usable. */
export function parseTacticsJson(raw: string): TacticRecommendation | null {
  let parsed: unknown
  try { parsed = JSON.parse(stripFences(raw)) } catch { return null }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const o = parsed as Record<string, unknown>

  const picks: TacticPick[] = Array.isArray(o.picks)
    ? o.picks
        .map((p) => {
          const x = (p ?? {}) as Record<string, unknown>
          const tacticId = str(x.tacticId, 40)
          return {
            tacticId,
            why: str(x.why, 400),
            evidence: str(x.evidence, 240),
            line: str(x.line, 400),
            caution: str(x.caution, 300),
          }
        })
        .filter((p) => tacticById(p.tacticId) && (p.why || p.line)) // id real + algo de contenido
        .slice(0, 4)
    : []

  const rec: TacticRecommendation = {
    style: str(o.style, 500),
    picks,
    avoid: str(o.avoid, 300),
  }
  if (rec.picks.length === 0) return null
  return rec
}
