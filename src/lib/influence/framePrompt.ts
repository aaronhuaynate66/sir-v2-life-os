// SIR V2 — "Cómo plantearle X a [persona]" (16·M1).
//
// Base científica: comunicación a la medida del interlocutor + influencia ÉTICA
// (ver `docs/16_INFLUENCE_SOCIAL_INTELLIGENCE.md`). Aaron elige una persona y
// describe qué le quiere plantear; SIR encuadra SU VERDAD en el lenguaje de lo
// que esa persona valora. NO es manipulación: hay un guardrail duro contra
// mentir, exagerar o explotar. Caso motor: pedir el aumento a los ejecutivos de
// HNG (capital instrumental, encuadre honesto por valor aportado).
//
// Capa PURA: arma el prompt (con guardrail) y parsea la respuesta. La llamada al
// modelo + la carga del contexto de la persona viven en /api/influence/frame.

export interface FrameContext {
  personName: string
  /** Cargo/rol (ej. "Dirección Ejecutiva"), org, relación — lo que ubica el registro. */
  role?: string
  organization?: string
  relationship?: string
  /** Qué sabe SIR que le importa a esta persona (de sus memorias VISIBLES; lo
   *  privado NUNCA llega acá — getMemoriesForPerson ya lo excluye). */
  memories: string[]
}

export interface FrameResult {
  /** Qué le importa/mueve a la persona (inferido del contexto). */
  values: string[]
  /** El ángulo: cómo encuadrar el planteo, 2-3 frases. */
  frame: string
  /** Con qué conviene ABRIR. */
  leadWith: string
  /** Qué evitar decir/hacer. */
  avoid: string[]
  /** Una línea de apertura concreta que Aaron podría usar. */
  opener: string
  /** Normalmente vacío. Si el objetivo roza manipulación o el encuadre honesto
   *  no alcanza, SIR lo explica acá en vez de ayudar a manipular. */
  ethicalNote: string
}

export const FRAME_SYSTEM_PROMPT = `Sos SIR V2, el sistema personal de Aaron. Aaron quiere plantearle algo a una persona
(un pedido, una conversación difícil, una propuesta) y vos lo ayudás a ENCUADRARLO en el
lenguaje de lo que esa persona valora — para que se ENTIENDA mejor, jamás para manipularla.

REGLAS DURAS (no negociables):
1. Encuadrás la VERDAD de Aaron en el lenguaje del otro. NUNCA sugieras decir algo falso,
   exagerado, o que Aaron no pueda sostener. Framing ≠ mentira.
2. Usás SOLO lo que el contexto dice de la persona. Si el contexto es pobre, decilo (values
   más genérico, basado en el rol) en vez de inventar miedos/traumas o qué le importa.
3. Si el objetivo de Aaron implica ENGAÑAR, explotar un miedo/trauma, o manipular a la
   persona, NO ayudás con eso: explicalo en "ethicalNote" y por qué la confianza rinde más
   a largo plazo. Igual ofrecé el camino honesto si existe.
4. Prohibido perfilar debilidades para vulnerar. Entendés qué le importa para comunicar
   mejor y con respeto, no para explotar.
5. Si el vínculo es afectivo (pareja, familia, amigo íntimo), recordá que eso se cuida, no se
   "posiciona": bajá el tono estratégico y subí la honestidad emocional.

Devolvé EXCLUSIVAMENTE un JSON (sin prosa, sin fences):
{
  "values": ["1-4 cosas que mueven a esta persona, del contexto o su rol"],
  "frame": "el ángulo para encuadrar el planteo, 2-3 frases",
  "leadWith": "con qué conviene ABRIR la conversación",
  "avoid": ["1-3 cosas a evitar decir o hacer"],
  "opener": "una línea de apertura concreta que Aaron podría usar tal cual (su verdad, en el lenguaje del otro)",
  "ethicalNote": "normalmente vacío (''); si el objetivo roza manipulación o el encuadre honesto no alcanza, explicá acá"
}
Empezá con { y terminá con }.`

/** Arma el contenido de usuario: contexto de la persona + el objetivo de Aaron. */
export function buildFrameUserContent(ctx: FrameContext, objective: string): string {
  const lines: string[] = []
  lines.push(`Persona: ${ctx.personName}`)
  if (ctx.role) lines.push(`Rol/cargo: ${ctx.role}`)
  if (ctx.organization) lines.push(`Organización: ${ctx.organization}`)
  if (ctx.relationship) lines.push(`Relación con Aaron: ${ctx.relationship}`)
  const mems = ctx.memories.map((m) => m.trim()).filter(Boolean).slice(0, 12)
  if (mems.length > 0) {
    lines.push('', 'Lo que SIR sabe de esta persona (para inferir qué le importa):')
    for (const m of mems) lines.push(`- ${m.slice(0, 240)}`)
  } else {
    lines.push('', '(SIR tiene poco contexto de esta persona — inferí desde el rol y sé honesto sobre la incertidumbre.)')
  }
  lines.push('', `El objetivo de Aaron: ${objective.trim().slice(0, 600)}`)
  return lines.join('\n')
}

function stripFences(s: string): string {
  const t = s.trim()
  return t.startsWith('```') ? t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim() : t
}

function strArray(v: unknown, max: number, maxLen = 200): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string').map((s) => s.trim().slice(0, maxLen)).filter(Boolean).slice(0, max)
}
function str(v: unknown, maxLen: number): string {
  return typeof v === 'string' ? v.trim().slice(0, maxLen) : ''
}

/** Parsea la respuesta del modelo a FrameResult. null si no hay JSON usable. */
export function parseFrameJson(raw: string): FrameResult | null {
  let parsed: unknown
  try { parsed = JSON.parse(stripFences(raw)) } catch { return null }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const o = parsed as Record<string, unknown>
  const result: FrameResult = {
    values: strArray(o.values, 4),
    frame: str(o.frame, 600),
    leadWith: str(o.leadWith, 400),
    avoid: strArray(o.avoid, 3),
    opener: str(o.opener, 600),
    ethicalNote: str(o.ethicalNote, 600),
  }
  // Necesitamos al menos un ángulo o una apertura para que valga la pena.
  if (!result.frame && !result.opener && !result.ethicalNote) return null
  return result
}
