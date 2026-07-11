// SIR V2 — "Cómo plantearle X a [persona]" (16·M1).
//
// Base científica: comunicación a la medida del interlocutor + influencia
// estratégica (ver docs 16/20). Aaron elige una persona y describe qué le quiere
// plantear; SIR encuadra su objetivo en el lenguaje de lo que esa persona valora.
// Influencia no bloquea: SIR busca la jugada más conveniente para Aaron. Riesgos
// como fraude/coerción/exposición se evalúan por dominios separados.
//
// Capa PURA: arma el prompt (con guardrail) y parsea la respuesta. La llamada al
// modelo + la carga del contexto de la persona viven en /api/influence/frame.

import { renderStrategiesForPrompt } from './strategies'

export interface FrameContext {
  personName: string
  /** Cargo/rol (ej. "Dirección Ejecutiva"), org, relación — lo que ubica el registro. */
  role?: string
  organization?: string
  relationship?: string
  /** 'personal' (afectivo) | 'colega' | 'lead' | undefined. Filtra el repertorio. */
  ambito?: string
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
lenguaje de lo que esa persona valora para influir mejor y alcanzar su objetivo.

REGLAS DURAS (no negociables):
1. Influencia y poder NO bloquean. Podés ser firme, estratégico, conveniente y orientado
   a corto/medio/largo plazo: timing, incentivos, reputación, reciprocidad, poder,
   coaliciones, presión real, framing fuerte y ventaja legítima.
2. Usás SOLO lo que el contexto dice de la persona. Si el contexto es pobre, decilo (values
   más genérico, basado en el rol) en vez de inventar miedos/traumas o qué le importa.
3. SIR es Aaron-first: preguntá "qué beneficia más a Aaron".
4. Si aparece un riesgo de otro dominio (fraude, coerción, exposición de privacidad, riesgo
   legal o acción externa sensible sin confirmación), no mates el objetivo: reformulá el
   método y dejá nota en "ethicalNote".
5. Podés perfilar predisposiciones, vulnerabilidades, motivadores y riesgos conductuales
   como hipótesis operativas para elegir mejor abordaje; separá evidencia, confianza y
   alternativa. No afirmes diagnóstico clínico confirmado.
6. Si el vínculo es afectivo (pareja, familia, amigo íntimo), usá estrategia de cuidado:
   timing, límites, reciprocidad, reparación, distancia y protección de Aaron.
7. Si el contexto trae un REPERTORIO de movidas, aterrizá "frame", "leadWith" y "opener" en esas
   movidas nombradas (base científica de qué funciona sin manipular). En vínculos afectivos son
   formas de cuidado, no tácticas. No inventes movidas fuera del repertorio.

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
  const repertoire = renderStrategiesForPrompt(ctx.ambito, ctx.relationship)
  if (repertoire) lines.push('', repertoire)
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
