// SIR V2 — "Objetivo desde texto": la IA toma un relato libre (ej. una charla con
// un amigo) y PROPONE los campos de un objetivo. PURO + testeable (prompt +
// parse + validación de enums). NO persiste: la propuesta prefilla el formulario
// existente para que Aaron confirme/edite. Espeja intakeSuggest.
//
// Reglas de diseño (anti-invención): NO inventar fecha si el disparador es un
// evento (targetDate=null); prioridad alta por defecto, 'critical' solo si hay
// deadline/urgencia real; impacto-paz default 5; no auto-coronar como norte.

import type { GoalCategory, GoalPriority } from '@/types'

const CATEGORIES: GoalCategory[] = [
  'financial', 'personal', 'relational', 'health', 'career', 'spiritual', 'creative',
]
const PRIORITIES: GoalPriority[] = ['critical', 'high', 'medium', 'low']

export interface GoalSuggestion {
  title: string
  description: string
  category: GoalCategory
  priority: GoalPriority
  /** 1-10. */
  peaceImpact: number
  nextAction: string
  /** 'YYYY-MM-DD' o null (null si el disparador es un evento, no una fecha). */
  targetDate: string | null
  /** Nombres literales de personas mencionadas, para matchear a contactos. */
  relatedPersonNames: string[]
  /** Por qué SIR eligió estos campos; marca los campos blandos con incertidumbre. */
  reasoning: string
}

export const GOAL_SUGGEST_SYSTEM_PROMPT = `Sos un asistente que toma un RELATO LIBRE del usuario (ej. lo que habló con alguien, una idea, una decisión) y PROPONE un objetivo estructurado para su sistema personal.

Devolvé EXCLUSIVAMENTE un objeto JSON válido, sin texto alrededor:
{"title": string, "description": string, "category": string, "priority": string, "peaceImpact": number, "nextAction": string, "targetDate": string|null, "relatedPersonNames": string[], "reasoning": string}

Reglas:
- "title": corto y accionable (máx ~80 chars). Ej: "Ingresar al RIT (CGBVP)".
- "description": 1-3 frases con el contexto y el disparador. NO inventes datos que no estén en el relato.
- "category": UNA de: financial, personal, relational, health, career, spiritual, creative. Default 'personal'; usá 'career' si es claramente vocacional/profesional; 'health' si es físico/salud; 'relational' si el objetivo ES mejorar un vínculo.
- "priority": UNA de: critical, high, medium, low. Default 'high' si importa de verdad. 'critical' SOLO si hay un deadline real o algo urgente/en riesgo. Si el timing no lo controla el usuario o no hay fecha, NO uses critical.
- "peaceImpact": entero 1-10, cuánta paz/peso real tiene para el usuario. Si no podés inferirlo, 5.
- "nextAction": el primer paso concreto y bajo el control del usuario.
- "targetDate": 'YYYY-MM-DD' SOLO si el relato da una fecha objetivo real. Si el objetivo se gatilla por un EVENTO (ej. "cuando abran el curso") o no hay fecha, devolvé null. NUNCA inventes una fecha.
- "relatedPersonNames": nombres de personas mencionadas en el relato (literales, sin apodos de agenda). [] si ninguna.
- "reasoning": 1-3 frases en español explicando tus elecciones; mencioná explícitamente si la prioridad o el impacto son una suposición a confirmar.
- SOLO usá lo que está en el relato. No inventes personas, fechas ni métricas.`

export function buildGoalSuggestInput(text: string): string {
  return `Relato del usuario:\n\n"""\n${text.trim().slice(0, 4000)}\n"""\n\nDevolvé el JSON del objetivo propuesto.`
}

function pickEnum<T extends string>(v: unknown, allowed: T[], fallback: T): T {
  return typeof v === 'string' && (allowed as string[]).includes(v) ? (v as T) : fallback
}
function cap(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}
function clampPeace(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 5
  return Math.min(10, Math.max(1, Math.round(v)))
}
function sanitizeDate(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/** Parsea la respuesta del modelo (JSON tolerante) → propuesta validada. null si
 *  no hay título utilizable. */
export function parseGoalSuggestion(raw: string): GoalSuggestion | null {
  if (!raw) return null
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
  const title = cap(obj.title, 80)
  if (title.length < 2) return null
  const names = Array.isArray(obj.relatedPersonNames)
    ? obj.relatedPersonNames.map((n) => cap(n, 80)).filter((n) => n.length >= 2).slice(0, 10)
    : []
  return {
    title,
    description: cap(obj.description, 600),
    category: pickEnum(obj.category, CATEGORIES, 'personal'),
    priority: pickEnum(obj.priority, PRIORITIES, 'high'),
    peaceImpact: clampPeace(obj.peaceImpact),
    nextAction: cap(obj.nextAction, 200),
    targetDate: sanitizeDate(obj.targetDate),
    relatedPersonNames: names,
    reasoning: cap(obj.reasoning, 400),
  }
}
