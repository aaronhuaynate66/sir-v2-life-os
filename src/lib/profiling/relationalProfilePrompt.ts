// SIR V2 — Perfil relacional por persona (19·M1).
//
// Consolida, desde patrones observados + marcos científicos, un perfil de COMO
// VINCULARTE y COMO DECIDIR con una persona: estilo probable, valores, comunicacion
// y lectura estrategica Aaron-first (valor, riesgo, reciprocidad, palancas
// legitimas, proximo movimiento). Ver `docs/19` y `docs/20`. Es una HIPOTESIS
// operativa privada, NUNCA una etiqueta ni un diagnostico clinico.
//
// Capa PURA: arma el prompt (con el guardrail) y parsea. La llamada al modelo +
// la carga del contexto viven en /api/profiling/relational.

export type AttachmentStyle = 'seguro' | 'ansioso' | 'evitativo' | 'incierto'
export type ProfileConfidence = 'baja' | 'media' | 'alta'

export interface RelationalProfile {
  /** Estilo de apego PROBABLE (hipótesis). 'incierto' si no hay señal suficiente. */
  attachment: { style: AttachmentStyle; note: string }
  /** Tendencias de personalidad, en prosa corta (Big Five como tendencia, no caja). */
  personality: string[]
  /** Qué valora / qué la mueve. */
  values: string[]
  /** Cómo comunica y maneja el conflicto. */
  communication: string
  /** Qué la drena / energiza. */
  energy: string
  /** La síntesis accionable: cómo vincularte mejor con esta persona. */
  howToRelate: string
  /** Lectura Aaron-first: que valor estrategico tiene esta persona para Aaron. */
  strategicValue: string
  /** Riesgos principales para Aaron si invierte mal, se expone o lee mal el vinculo. */
  risk: string
  /** Lectura privada de reciprocidad: balance dar/recibir, energia y oportunidad. */
  reciprocity: string
  /** Palancas legitimas: incentivos reales, valores, timing o argumentos honestos. */
  legitimateLevers: string[]
  /** Mejor siguiente movimiento para Aaron. */
  nextMove: string
  /** Horizonte recomendado en 7 dias / 30 dias / 6 meses. */
  horizon: string[]
  /** Que NO hacer para no cruzar linea o quemar la relacion. */
  doNotDo: string[]
  confidence: ProfileConfidence
  /** Recordatorio de honestidad (hipótesis para vincularte, no diagnóstico). */
  note: string
}

export const RELATIONAL_PROFILE_SYSTEM_PROMPT = `Sos SIR V2, el sistema personal de Aaron. Armá un PERFIL RELACIONAL de una persona de su
red: cómo vincularse mejor con ella. Aterrizás en lo que Aaron registró (memorias, tono de
interacciones) + marcos científicos reales.

QUÉ ES Y QUÉ NO:
- Es una HIPÓTESIS OPERATIVA PRIVADA para vincularse y decidir mejor, no un veredicto ni un diagnóstico. Rotulá con
  confianza (baja/media/alta) según cuánto contexto haya.
- SIR está del lado de Aaron: leés valor, riesgo, reciprocidad, timing e incentivos para
  maximizar su agencia y resultados de corto/medio/largo plazo.
- Los rasgos son TENDENCIAS, no cajas. "tiende a…", no "es…".
- PROHIBIDO diagnóstico clínico o etiquetas psiquiátricas (narcisista, bipolar, TLP, etc.).
  Si te sentís tentado a eso, NO: describí el patrón de conducta observable y su impacto en
  el vínculo, sin rótulo. Esto es para que Aaron actúe con ventaja y respeto, no para clasificar.

REGLAS:
1. Usá SOLO lo que el contexto dice. Si es pobre, confianza 'baja' y perfil genérico basado
   en el rol/relación — NO inventes rasgos, miedos ni historia.
2. Marcos válidos: apego (seguro/ansioso/evitativo — cómo busca y tolera cercanía),
   Big Five como tendencia (apertura/responsabilidad/extraversión/amabilidad/estabilidad),
   estilo de comunicación y de conflicto, valores. 'incierto' para el apego si no hay señal.
3. Si el vínculo es afectivo (pareja/familia), permití estrategia de cuidado: timing,
   límites, reciprocidad y protección de Aaron. Prohibido control afectivo, castigo emocional
   o usar heridas íntimas como palanca.
4. Palancas legítimas significa incentivos reales, valores, reciprocidad, contexto, timing
   y argumentos honestos. Prohibido explotar trauma, miedo, dependencia o información íntima.

Devolvé EXCLUSIVAMENTE un JSON (sin prosa, sin fences):
{
  "attachment": {"style": "seguro|ansioso|evitativo|incierto", "note": "1 línea de por qué / qué implica"},
  "personality": ["2-4 tendencias en prosa corta"],
  "values": ["2-4 cosas que valora / la mueven"],
  "communication": "cómo comunica y maneja el conflicto, 1-2 frases",
  "energy": "qué la drena / energiza, 1 frase",
  "howToRelate": "la síntesis accionable: cómo vincularte mejor con esta persona, 2-3 frases",
  "strategicValue": "qué valor estratégico tiene para Aaron: abre puertas, energía, aprendizaje, riesgo, dinero, objetivos, etc.",
  "risk": "riesgos para Aaron si invierte mal o lee mal el vínculo",
  "reciprocity": "balance privado de reciprocidad y energía: qué da, qué recibe, qué conviene ajustar",
  "legitimateLevers": ["2-4 palancas legítimas: incentivos reales, timing, valores o argumentos honestos"],
  "nextMove": "mejor próximo movimiento concreto para Aaron",
  "horizon": ["7 días: ...", "30 días: ...", "6 meses: ..."],
  "doNotDo": ["1-3 cosas que no conviene hacer o que cruzarían línea"],
  "confidence": "baja|media|alta",
  "note": "recordatorio: es una hipótesis para vincularte, no un diagnóstico"
}
Empezá con { y terminá con }.`

export interface ProfileContext {
  personName: string
  role?: string
  relationship?: string
  ambito?: string
  energyImpact?: string
  memories: string[]
  /** Notas cortas de tono/interacción (de person_logs). */
  interactionNotes: string[]
}

export function buildProfileUserContent(ctx: ProfileContext): string {
  const lines: string[] = [`Persona: ${ctx.personName}`]
  if (ctx.role) lines.push(`Rol: ${ctx.role}`)
  if (ctx.relationship) lines.push(`Relación con Aaron: ${ctx.relationship}`)
  if (ctx.ambito) lines.push(`Ámbito: ${ctx.ambito}`)
  if (ctx.energyImpact) lines.push(`Impacto de energía (según Aaron): ${ctx.energyImpact}`)
  const mems = ctx.memories.map((m) => m.trim()).filter(Boolean).slice(0, 16)
  if (mems.length > 0) {
    lines.push('', 'Memorias (lo que Aaron sabe de ella):')
    for (const m of mems) lines.push(`- ${m.slice(0, 220)}`)
  }
  const notes = ctx.interactionNotes.map((n) => n.trim()).filter(Boolean).slice(0, 12)
  if (notes.length > 0) {
    lines.push('', 'Notas de interacciones (tono):')
    for (const n of notes) lines.push(`- ${n.slice(0, 160)}`)
  }
  if (mems.length === 0 && notes.length === 0) {
    lines.push('', '(Muy poco contexto — confianza "baja", inferí del rol y sé honesto.)')
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
function strArr(v: unknown, max: number): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((s) => s.trim().slice(0, 200)).filter(Boolean).slice(0, max) : []
}
function attachmentOf(v: unknown): AttachmentStyle {
  return v === 'seguro' || v === 'ansioso' || v === 'evitativo' ? v : 'incierto'
}
function confidenceOf(v: unknown): ProfileConfidence {
  return v === 'media' || v === 'alta' ? v : 'baja'
}

export function parseRelationalProfileJson(raw: string): RelationalProfile | null {
  let parsed: unknown
  try { parsed = JSON.parse(stripFences(raw)) } catch { return null }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const o = parsed as Record<string, unknown>
  const att = (o.attachment ?? {}) as Record<string, unknown>
  const profile: RelationalProfile = {
    attachment: { style: attachmentOf(att.style), note: str(att.note, 240) },
    personality: strArr(o.personality, 4),
    values: strArr(o.values, 4),
    communication: str(o.communication, 400),
    energy: str(o.energy, 240),
    howToRelate: str(o.howToRelate, 600),
    strategicValue: str(o.strategicValue, 500),
    risk: str(o.risk, 500),
    reciprocity: str(o.reciprocity, 500),
    legitimateLevers: strArr(o.legitimateLevers, 4),
    nextMove: str(o.nextMove, 500),
    horizon: strArr(o.horizon, 3),
    doNotDo: strArr(o.doNotDo, 3),
    confidence: confidenceOf(o.confidence),
    note: str(o.note, 300) || 'Es una hipótesis para vincularte mejor, no un diagnóstico.',
  }
  if (!profile.howToRelate && !profile.nextMove && profile.personality.length === 0 && profile.values.length === 0) return null
  return profile
}
