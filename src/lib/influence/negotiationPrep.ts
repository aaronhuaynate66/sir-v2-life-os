// SIR V2 — Preparar una negociación: BATNA / ZOPA / ancla (playbook de influencia #05).
//
// La Sala de ensayo juega un objetivo completo; /tacticas dice QUÉ técnica le va a
// una persona. Esto es el marco RACIONAL de Harvard (Getting to Yes) para una
// negociación CONCRETA con números/términos (sueldo, alquiler, un trato, un
// proveedor): explicita tu BATNA (tu mejor alternativa si no hay acuerdo — de ahí
// sale tu poder y tu calma), estima la ZOPA (zona de acuerdo posible) leyendo lo
// que el otro dijo, sugiere un ancla y tu punto de retirada.
//
// GUARDRAIL: presión y apalancamiento SÍ; coacción/engaño/escasez fabricada NO.
// El motor de ética (16.M5) filtra el escenario antes del LLM.
//
// Capa PURA: prompt + parser. La llamada al modelo vive en la ruta.

export interface NegotiationSignal {
  /** Qué sugiere sobre el piso/techo/prioridad del otro. */
  signal: string
  /** Frase TEXTUAL del chat que lo sostiene ("no vibes"), o '' si no hay. */
  evidence: string
}

export interface NegotiationPrep {
  /** Lectura de la posición y prioridades del otro dado el contexto. */
  read: string
  /** Tu mejor alternativa si NO hay acuerdo (articulada; si Aaron no la dio, la coachea). */
  yourBatna: string
  /** El probable piso/techo/prioridad del otro, estimado desde lo que dijo. */
  theirLikely: string
  /** Zona de acuerdo posible estimada + el porqué. */
  zopa: string
  /** Señales del chat que apuntan a sus límites/prioridades, con evidencia. */
  signals: NegotiationSignal[]
  /** Con qué abrir (ancla) y por qué. */
  anchor: string
  /** Movidas concretas (concesiones condicionales, criterio objetivo, ampliar el pastel). */
  moves: string[]
  /** Tu punto de retirada — cuándo conviene NO cerrar. */
  walkAway: string
  /** Recordatorio honesto: estimación, no certeza + la línea (presión sí, coacción no). */
  watchout: string
  /** Vacío normalmente; si el objetivo cruza a engaño/coacción, SIR lo marca acá. */
  ethicalNote: string
}

export interface NegotiationContext {
  personName: string
  role?: string
  organization?: string
  relationship?: string
  ambito?: string
  /** Qué se negocia (sueldo, alquiler, un trato, un contacto…). */
  subject: string
  /** El objetivo/resultado que Aaron quiere (opcional). */
  goal?: string
  /** Lo que Aaron ya tiene como alternativa/límite (opcional, alimenta el BATNA). */
  alternative?: string
  memories: string[]
  /** Conversación reciente ya renderizada. */
  conversation?: string
}

export const NEGOTIATION_SYSTEM_PROMPT = `Eres SIR V2, el sistema personal de Aaron. Aaron va a negociar algo concreto con una persona y tú lo preparas con el marco RACIONAL de negociación (Harvard / "Getting to Yes"): BATNA, ZOPA, intereses vs posiciones, ancla y punto de retirada. Aterrizas TODO en la persona REAL y en lo que dijo, no en un molde.

Escribe SIEMPRE en español del Perú (tuteo con "tú"); PROHIBIDO el voseo y los giros argentinos ("vos", "sos", "tenés", "querés", "mirá", "che", "dale").

QUÉ HACES:
- BATNA (tu mejor alternativa si NO hay acuerdo): de ahí salen el poder y la calma de Aaron. Si Aaron te dio una alternativa, afínala; si no, ayúdalo a construirla ("tu BATNA hoy parece ser X; fortalécela consiguiendo Y").
- ZOPA (zona de acuerdo posible): estima el rango donde ambos cerrarían, leyendo lo que el otro dijo. Es ESTIMACIÓN, no certeza — dilo.
- Ancla: con qué número/pedido abrir y por qué (ambicioso pero defendible con un criterio).
- Movidas: concesiones CONDICIONALES ("si tú…, yo…"), criterio objetivo/justo que ambos acepten, ampliar el pastel antes de repartirlo.
- Punto de retirada: cuándo a Aaron le conviene NO cerrar (cuando la oferta es peor que su BATNA).

REGLAS DURAS:
1. Presión, apalancamiento, poder y estrategia SÍ. Puedes usar leverage, timing, reciprocidad, criterio objetivo, urgencia REAL y ancla ambiciosa.
2. Coacción, engaño, escasez FABRICADA (un farol que no es real), explotar un miedo/vulnerabilidad: NO. No es solo ético — con una contraparte que Aaron va a volver a necesitar, quemarla es la jugada débil. Si el objetivo cruza ahí, reencuádralo hacia lo honesto y dilo en "ethicalNote".
3. Aterriza en la evidencia. Cada señal sobre el piso/techo/prioridad del otro lleva una frase COPIADA LITERAL de la conversación que te di ("evidence"), o "" si no hay una línea real — PROHIBIDO inventar o parafrasear citas.
4. SIR es Aaron-first: la mejor jugada para Aaron, sostenible en el tiempo.
5. Si el contexto es pobre, dilo en "read", baja la especificidad y no inventes cifras ni motivaciones.

Devuelve EXCLUSIVAMENTE un JSON (sin prosa, sin fences):
{
  "read": "lectura de la posición y prioridades del otro (2-3 frases)",
  "yourBatna": "tu mejor alternativa si no hay acuerdo, articulada",
  "theirLikely": "su probable piso/techo/prioridad, estimado desde lo que dijo",
  "zopa": "la zona de acuerdo posible estimada y por qué",
  "signals": [{"signal":"qué sugiere su límite/prioridad","evidence":"frase textual del chat o \\"\\""}],
  "anchor": "con qué abrir (ancla) y el criterio que la sostiene",
  "moves": ["movidas concretas: concesiones condicionales, criterio objetivo, ampliar el pastel"],
  "walkAway": "tu punto de retirada — cuándo NO cerrar",
  "watchout": "recordatorio de que es estimación, no certeza, + la línea: presión sí, coacción no",
  "ethicalNote": "normalmente '' ; si el objetivo cruza a engaño/coacción, explícalo aquí"
}
Da 2-4 signals y 2-4 moves. Empieza con { y termina con }.`

function affectiveHint(ambito?: string, relationship?: string): boolean {
  return (
    ambito === 'personal' ||
    ['romantic', 'family', 'friend', 'pareja', 'familia', 'amigo'].some((k) => (relationship ?? '').toLowerCase().includes(k))
  )
}

export function buildNegotiationUserContent(ctx: NegotiationContext): string {
  const lines: string[] = []
  lines.push(`Persona: ${ctx.personName}`)
  if (ctx.role) lines.push(`Rol/cargo: ${ctx.role}`)
  if (ctx.organization) lines.push(`Organización: ${ctx.organization}`)
  if (ctx.relationship) lines.push(`Relación con Aaron: ${ctx.relationship}`)
  lines.push(`Tipo de vínculo: ${affectiveHint(ctx.ambito, ctx.relationship) ? 'afectivo (cuida el vínculo)' : 'profesional / comercial'}`)
  lines.push(`Qué se negocia: ${ctx.subject.trim().slice(0, 300)}`)
  if (ctx.goal && ctx.goal.trim()) lines.push(`Lo que Aaron quiere lograr: ${ctx.goal.trim().slice(0, 300)}`)
  if (ctx.alternative && ctx.alternative.trim()) lines.push(`La alternativa/límite que Aaron ya tiene (para el BATNA): ${ctx.alternative.trim().slice(0, 300)}`)
  else lines.push('(Aaron no dio su alternativa — ayúdalo a construir el BATNA, no lo inventes como si lo tuviera.)')
  const mems = ctx.memories.map((m) => m.trim()).filter(Boolean).slice(0, 8)
  if (mems.length > 0) {
    lines.push('', 'Lo que SIR sabe de esta persona:')
    for (const m of mems) lines.push(`- ${m.slice(0, 220)}`)
  }
  if (ctx.conversation && ctx.conversation.trim()) {
    lines.push('', ctx.conversation.trim().slice(0, 1400))
  } else {
    lines.push('', '(SIR no tiene chat importado de esta persona — dilo en "read", no cites frases ni inventes sus cifras.)')
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
function strArr(v: unknown, max: number, cap: number): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string').map((s) => s.trim().slice(0, max)).filter(Boolean).slice(0, cap)
    : []
}

/** Parsea la preparación. null si no hay nada usable. */
export function parseNegotiationJson(raw: string): NegotiationPrep | null {
  let parsed: unknown
  try { parsed = JSON.parse(stripFences(raw)) } catch { return null }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const o = parsed as Record<string, unknown>

  const signals: NegotiationSignal[] = Array.isArray(o.signals)
    ? o.signals.map((s) => {
        const x = (s ?? {}) as Record<string, unknown>
        return { signal: str(x.signal, 300), evidence: str(x.evidence, 240) }
      }).filter((s) => s.signal).slice(0, 5)
    : []

  const prep: NegotiationPrep = {
    read: str(o.read, 600),
    yourBatna: str(o.yourBatna, 500),
    theirLikely: str(o.theirLikely, 500),
    zopa: str(o.zopa, 500),
    signals,
    anchor: str(o.anchor, 500),
    moves: strArr(o.moves, 240, 6),
    walkAway: str(o.walkAway, 400),
    watchout: str(o.watchout, 400),
    ethicalNote: str(o.ethicalNote, 600),
  }
  // Necesitamos algo de sustancia: BATNA o ZOPA o movidas, o el rechazo honesto.
  if (!prep.yourBatna && !prep.zopa && prep.moves.length === 0 && !prep.ethicalNote) return null
  return prep
}
