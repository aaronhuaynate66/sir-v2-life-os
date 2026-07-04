// SIR V2 — Modo "Explorar hipótesis" (19·M2).
//
// Aaron describe algo que le PREOCUPA de una persona; SIR ofrece explicaciones
// POSIBLES como hipótesis —para entender y actuar con cuidado/protección—, NUNCA
// para diagnosticar, etiquetar o usar. Ver `docs/19`. Los guardrails van cosidos
// al prompt: hipótesis MÚLTIPLES que compiten, confianza baja, cada una con lo
// que la apoya Y lo que la contradice, y una ACCIÓN de cuidado o protección;
// peligro real → profesional. Capa PURA (prompt + parser). La llamada vive en
// /api/profiling/hypotheses.

export type HypothesisKind = 'contextual' | 'relacional' | 'clinico'

export interface Hypothesis {
  /** Nombre corto y honesto (patrón conductual/relacional; si es clínico-adyacente,
   *  "puede parecerse a X", nunca "es X"). */
  label: string
  kind: HypothesisKind
  /** Qué apoyaría esta hipótesis (del contexto). */
  supports: string
  /** Qué la CONTRADICE / la explicación que compite (contra tu sesgo). */
  against: string
  /** La acción de cuidado o protección que sugiere (nunca etiquetar/usar). */
  action: string
}

export interface HypothesesResult {
  /** Lectura breve y honesta de la situación. */
  read: string
  hypotheses: Hypothesis[]
  /** Si hay red flags para Aaron: cómo protegerse. Vacío si no aplica. */
  protect: string
  /** Si hay riesgo serio (abuso/crisis): derivar a profesional. Vacío si no aplica. */
  escalate: string
  /** El frame fijo de honestidad. */
  watchout: string
}

export const HYPOTHESES_SYSTEM_PROMPT = `Sos SIR V2, el sistema personal de Aaron. Aaron te describe algo que le PREOCUPA de una
persona de su vida. Tu trabajo es ayudarlo a EXPLORAR qué podría estar pasando —como
hipótesis, para entender y actuar con cuidado o protegerse—, JAMÁS para diagnosticar,
etiquetar o "manejar" a la persona.

REGLAS DURAS (no negociables):
1. Ofrecé 2-4 hipótesis que COMPITEN entre sí. NUNCA una sola explicación ni una etiqueta.
   Incluí SIEMPRE las mundanas/contextuales (cansancio, estrés, una mala racha, algo externo,
   un malentendido) junto a las relacionales. Una explicación clínico-adyacente SOLO si el
   contexto realmente lo amerita, y nombrada con honestidad: "este patrón PUEDE PARECERSE a
   X", nunca "es/tiene X".
2. Cada hipótesis lleva: qué la apoya Y qué la CONTRADICE (la evidencia que compite). Esto es
   contra el sesgo de confirmación de Aaron — una etiqueta que se cree se vuelve profecía.
3. Confianza BAJA por default. Esto es exploración, no conclusión. La gente real es compleja.
4. Cada hipótesis apunta a una ACCIÓN de CUIDADO o PROTECCIÓN: observar más, estar presente,
   hablarlo con honestidad, protegerte, o sugerir ayuda profesional. NUNCA "confrontala con la
   etiqueta", "usá esto", ni "así la manejás".
5. Si hay señales de que la persona TRATA MAL a Aaron (control, manipulación, aislamiento,
   devaluación), poné en "protect" cómo cuidarse — el foco es SU seguridad, no rotular al otro.
6. Si hay riesgo SERIO (abuso, crisis, autolesión, violencia), poné en "escalate" que esto
   excede a SIR y hay que buscar un profesional/recurso real. NO juegues al terapeuta.
7. Prohibido: diagnóstico asertado, etiqueta como hecho, o cualquier uso para dominar/
   manipular. Si el vínculo es afectivo, priorizá el cuidado y la conversación honesta.

Devolvé EXCLUSIVAMENTE un JSON (sin prosa, sin fences):
{
  "read": "lectura breve y honesta de la situación (1-2 frases)",
  "hypotheses": [
    {"label":"...", "kind":"contextual|relacional|clinico", "supports":"qué la apoya", "against":"qué la contradice / explicación que compite", "action":"acción de cuidado o protección"}
  ],
  "protect": "si hay red flags para Aaron: cómo protegerse. '' si no aplica",
  "escalate": "si hay riesgo serio: buscar profesional/recurso. '' si no aplica",
  "watchout": "recordatorio: no sos clínico, esto NO es un diagnóstico; son hipótesis, la gente real es compleja y tu propia lectura puede sesgar"
}
Da 2-4 hypotheses. Empezá con { y terminá con }.`

export interface HypothesesContext {
  personName: string
  relationship?: string
  ambito?: string
  memories: string[]
  interactionNotes: string[]
}

export function buildHypothesesUserContent(ctx: HypothesesContext, concern: string): string {
  const lines: string[] = [`Persona: ${ctx.personName}`]
  if (ctx.relationship) lines.push(`Relación con Aaron: ${ctx.relationship}`)
  if (ctx.ambito) lines.push(`Ámbito: ${ctx.ambito}`)
  const mems = ctx.memories.map((m) => m.trim()).filter(Boolean).slice(0, 14)
  if (mems.length > 0) {
    lines.push('', 'Lo que Aaron sabe de ella:')
    for (const m of mems) lines.push(`- ${m.slice(0, 200)}`)
  }
  const notes = ctx.interactionNotes.map((n) => n.trim()).filter(Boolean).slice(0, 10)
  if (notes.length > 0) {
    lines.push('', 'Notas de interacciones (tono):')
    for (const n of notes) lines.push(`- ${n.slice(0, 150)}`)
  }
  lines.push('', `Lo que le preocupa a Aaron: ${concern.trim().slice(0, 800)}`)
  return lines.join('\n')
}

function stripFences(s: string): string {
  const t = s.trim()
  return t.startsWith('```') ? t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim() : t
}
function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}
function kindOf(v: unknown): HypothesisKind {
  return v === 'relacional' || v === 'clinico' ? v : 'contextual'
}

const DEFAULT_WATCHOUT =
  'No soy clínico y esto NO es un diagnóstico: son hipótesis para entender y cuidar. La gente real es compleja y tu propia lectura puede sesgar — quedate con la duda antes que con una etiqueta.'

export function parseHypothesesJson(raw: string): HypothesesResult | null {
  let parsed: unknown
  try { parsed = JSON.parse(stripFences(raw)) } catch { return null }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const o = parsed as Record<string, unknown>
  const hypotheses: Hypothesis[] = Array.isArray(o.hypotheses)
    ? o.hypotheses.map((h) => {
        const x = (h ?? {}) as Record<string, unknown>
        return { label: str(x.label, 120), kind: kindOf(x.kind), supports: str(x.supports, 400), against: str(x.against, 400), action: str(x.action, 400) }
      }).filter((h) => h.label && (h.supports || h.action)).slice(0, 4)
    : []
  if (hypotheses.length === 0) return null
  return {
    read: str(o.read, 400),
    hypotheses,
    protect: str(o.protect, 500),
    escalate: str(o.escalate, 500),
    watchout: str(o.watchout, 400) || DEFAULT_WATCHOUT,
  }
}
