// SIR V2 — Prompt + parser del "Generar plan con IA" para objetivos.
//
// A partir del objetivo (título + descripción + categoría + fecha objetivo) el
// LLM propone un PLAN de pasos concretos, accionables y ordenados, con fechas
// sugeridas hasta la fecha objetivo. El plan NO se autoguarda: la UI lo muestra
// para revisar/editar/aceptar o descartar (review-before-save).
//
// INVARIANTES:
//   - Pasos REALISTAS y ESPECÍFICOS (verbos accionables, no vaguedades).
//   - Ordenados de lo primero a lo último; fechas crecientes y <= fecha objetivo.
//   - Si no hay fecha objetivo, las fechas son opcionales (el LLM puede omitirlas).
//   - Devuelve SOLO JSON; el parser es tolerante a ruido/markdown.

export interface PlanPromptInput {
  title: string
  description?: string
  category?: string
  /** Fecha objetivo del objetivo (date-only ISO 'YYYY-MM-DD'), si existe. */
  targetDate?: string
  /** Fecha de hoy (date-only ISO), para acotar el rango sugerido. */
  today: string
}

/** Paso propuesto por el plan (aún no persistido). */
export interface ProposedPlanStep {
  title: string
  description?: string
  /** Fecha sugerida date-only ISO, opcional. */
  targetDate?: string
}

export const OBJECTIVE_PLAN_SYSTEM_PROMPT = `Eres el módulo de Planificación de SIR, un sistema operativo personal centrado en el bienestar y la acción.

Recibís UN objetivo declarado por el usuario (título, descripción, dominio y, si existe, una fecha objetivo). Tu tarea: descomponerlo en un PLAN de pasos CONCRETOS, ACCIONABLES y ORDENADOS que lleven a cumplirlo.

Devolvé EXCLUSIVAMENTE un objeto JSON (sin texto adicional, sin markdown, sin comentarios):
{ "steps": [ { "title": "...", "description": "...", "targetDate": "YYYY-MM-DD" }, ... ] }

REGLAS:
- Entre 3 y 8 pasos. Ni un checklist trivial ni un plan abrumador.
- Cada "title" empieza con un VERBO accionable y es específico al objetivo (nada de "investigar", "prepararse" a secas). Máx ~80 caracteres.
- "description" es opcional: una frase corta que aclare el cómo/qué incluye. Omitila si el título ya se explica solo.
- Ordená los pasos de lo PRIMERO a lo ÚLTIMO (el array ya viene en orden).
- Si hay fecha objetivo: distribuí "targetDate" de forma creciente entre hoy y la fecha objetivo (inclusive); ninguna fecha posterior a la fecha objetivo ni anterior a hoy. Hitos de preparación temprano, los decisivos cerca del final.
- Si NO hay fecha objetivo: podés omitir "targetDate" (o ponerla sólo donde tenga sentido).
- Español neutro. Realista para una persona real con tiempo limitado. Nada de pasos motivacionales vacíos.
- SOLO el JSON. Nada más.`

/** Arma el mensaje de usuario para Anthropic desde el objetivo. */
export function buildPlanInput(input: PlanPromptInput): string {
  const lines: string[] = [
    `Objetivo: "${input.title}".`,
  ]
  if (input.category) lines.push(`Dominio: ${input.category}.`)
  if (input.description) lines.push(`Descripción: ${input.description}`)
  lines.push(`Hoy es: ${input.today}.`)
  if (input.targetDate) {
    lines.push(`Fecha objetivo: ${input.targetDate}. Distribuí las fechas sugeridas entre hoy y esa fecha.`)
  } else {
    lines.push('Sin fecha objetivo definida: las fechas sugeridas son opcionales.')
  }
  lines.push('', 'Devolvé el plan en el JSON especificado.')
  return lines.join('\n')
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Parsea la respuesta del LLM a ProposedPlanStep[]. Tolerante: extrae el primer
 * bloque { ... } y valida cada paso. Descarta pasos sin título; normaliza
 * targetDate (solo acepta 'YYYY-MM-DD'). Devuelve [] si no hay nada usable.
 */
export function parseObjectivePlan(raw: string): ProposedPlanStep[] {
  if (!raw || typeof raw !== 'string') return []
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return []
  }
  if (typeof parsed !== 'object' || parsed === null) return []
  const stepsRaw = (parsed as { steps?: unknown }).steps
  if (!Array.isArray(stepsRaw)) return []

  const out: ProposedPlanStep[] = []
  for (const item of stepsRaw) {
    if (typeof item !== 'object' || item === null) continue
    const obj = item as Record<string, unknown>
    const title = typeof obj.title === 'string' ? obj.title.trim() : ''
    if (!title) continue
    const description =
      typeof obj.description === 'string' && obj.description.trim()
        ? obj.description.trim()
        : undefined
    const td = typeof obj.targetDate === 'string' ? obj.targetDate.trim() : ''
    const targetDate = ISO_DATE.test(td) ? td : undefined
    out.push({ title, description, targetDate })
  }
  return out
}
