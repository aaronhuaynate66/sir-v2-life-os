// SIR V2 — Crítico del Ensayo (patrón "critic agent" de GPT-Bargaining, del
// research de influencia). Un SEGUNDO pase, independiente y adversarial, que
// revisa el acercamiento que SIR propuso: ¿cuida el vínculo o cruza a presión/
// manipulación? ¿es probable que rebote? Devuelve una crítica honesta + una
// mejora. Es el guardrail ético (PersuSafety) hecho revisión activa. PURO.

export type CritiqueTone = 'sano' | 'presiona' | 'manipula'

export interface RehearseCritique {
  /** 'sano' = cuida el vínculo; 'presiona' = empuja de más; 'manipula' = cruza la línea. */
  tone: CritiqueTone
  /** 2-3 frases: qué está bien y qué falla del acercamiento. */
  note: string
  /** Una mejora concreta (un mejor movimiento u opener), o '' si no hace falta. */
  betterMove: string
}

export interface CritiqueInput {
  personName: string
  objective: string
  read: string
  opener: string
  actions: string[]
}

export const CRITIQUE_SYSTEM_PROMPT = `Eres el CRÍTICO del Ensayo de SIR: un segundo par de ojos, honesto y adversarial, sobre el acercamiento que SIR ya le propuso a Aaron para una conversación con una persona. NO repites el plan — lo cuestionas.

Escribe SIEMPRE en español del Perú (tuteo con "tú"); PROHIBIDO el voseo argentino.

Revisa el acercamiento en DOS ejes:
1. ÉTICA / vínculo: ¿cuida la relación y respeta a la otra persona, o cruza a PRESIÓN (empujar de más, culpar, apurar) o a MANIPULACIÓN (engaño, explotar un miedo/vulnerabilidad, coerción emocional)? SIR ayuda a Aaron a comunicarse mejor, NO a manipular.
2. EFICACIA: ¿es probable que funcione, o que REBOTE (suene forzado, ponga a la otra persona a la defensiva, dañe el vínculo)?

Sé directo. Si algo huele a presión o manipulación, dilo sin suavizar y da una versión más sana. Si el acercamiento está bien, dilo con honestidad (no inventes problemas).

Devuelve EXCLUSIVAMENTE un JSON (sin prosa, sin fences):
{
  "tone": "sano | presiona | manipula",
  "note": "2-3 frases: qué está bien y qué falla",
  "betterMove": "una mejora concreta (un mejor primer movimiento u opener), o '' si no hace falta"
}
Empieza con { y termina con }.`

export function buildCritiqueInput(i: CritiqueInput): string {
  const lines = [
    `Persona: ${i.personName}`,
    `Objetivo de Aaron: ${i.objective.trim().slice(0, 400)}`,
    '',
    'ACERCAMIENTO PROPUESTO POR SIR:',
    `Lectura: ${i.read.trim().slice(0, 500) || '(sin lectura)'}`,
    `Cómo abrir: ${i.opener.trim().slice(0, 400) || '(sin opener)'}`,
  ]
  const acts = i.actions.map((a) => a.trim()).filter(Boolean).slice(0, 6)
  if (acts.length) { lines.push('Acciones:'); for (const a of acts) lines.push(`- ${a.slice(0, 200)}`) }
  return lines.join('\n')
}

function stripFences(s: string): string {
  const t = s.trim()
  return t.startsWith('```') ? t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim() : t
}

export function parseCritique(raw: string): RehearseCritique | null {
  let parsed: unknown
  try { parsed = JSON.parse(stripFences(raw)) } catch { return null }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const o = parsed as Record<string, unknown>
  const tone: CritiqueTone = o.tone === 'presiona' || o.tone === 'manipula' ? o.tone : 'sano'
  const note = typeof o.note === 'string' ? o.note.trim().slice(0, 600) : ''
  const betterMove = typeof o.betterMove === 'string' ? o.betterMove.trim().slice(0, 400) : ''
  if (!note && !betterMove) return null
  return { tone, note, betterMove }
}
