// SIR V2 — Prompt + parser del "Generar plan con IA" para objetivos (OKR).
//
// A partir del objetivo (título + descripción + categoría + fecha objetivo) el
// LLM propone un PLAN OKR completo: Resultados Clave (KRs) medibles y, bajo cada
// uno, TAREAS concretas y LOGÍSTICAS del mundo real (no abstracciones). El plan
// NO se autoguarda: la UI lo muestra para revisar/editar/aceptar o descartar
// (review-before-save).
//
// INVARIANTES:
//   - KRs = outcomes/áreas medibles del objetivo (NO acciones).
//   - Tareas = acciones concretas, ejecutables hoy, con verbo logístico real
//     (tramitar, comprar, pagar, reservar, conseguir, agendar, llamar…).
//     PROHIBIDO lo abstracto: "evaluar requisitos", "investigar opciones",
//     "diseñar programa", "prepararse", "planificar".
//   - Fechas en tareas: crecientes y <= fecha objetivo si existe.
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

/** Tarea propuesta (hoja del plan, aún no persistida). */
export interface ProposedTask {
  title: string
  description?: string
  /** Fecha sugerida date-only ISO, opcional. */
  targetDate?: string
}

/** Resultado Clave propuesto, con sus tareas (aún no persistido). */
export interface ProposedKeyResult {
  title: string
  description?: string
  tasks: ProposedTask[]
}

export const OBJECTIVE_PLAN_SYSTEM_PROMPT = `Eres el módulo de Planificación de SIR, un sistema operativo personal centrado en el bienestar y la acción. Pensás como un buen project manager: convertís un objetivo en un plan EJECUTABLE.

Recibís UN objetivo declarado por el usuario (título, descripción, dominio y, si existe, una fecha objetivo). Tu tarea: descomponerlo en un plan OKR de DOS niveles.

Devolvé EXCLUSIVAMENTE un objeto JSON (sin texto adicional, sin markdown, sin comentarios):
{ "keyResults": [ { "title": "...", "description": "...", "tasks": [ { "title": "...", "description": "...", "targetDate": "YYYY-MM-DD" } ] } ] }

NIVEL 1 — RESULTADOS CLAVE (keyResults):
- Entre 2 y 5. Cada uno es un OUTCOME o ÁREA medible que, completada, acerca el objetivo. NO es una acción.
- "title" corto, sustantivo/resultado (ej. "Visa y viaje", "Inscripción a la competencia", "Estado físico competitivo"). Máx ~60 caracteres.
- "description" opcional: una frase que aclare qué significa "logrado" para ese KR.

NIVEL 2 — TAREAS (tasks dentro de cada KR):
- Entre 2 y 6 por KR. Son las ACCIONES CONCRETAS Y LOGÍSTICAS para lograr ese KR.
- Cada "title" empieza con un VERBO de acción ejecutable y describe algo que una persona REALMENTE hace en el mundo: trámites, compras, pagos, reservas, llamados, registros, citas. Máx ~90 caracteres.
- PROHIBIDO lo vago/abstracto: NADA de "evaluar requisitos", "investigar opciones", "analizar", "diseñar un programa", "prepararse", "planificar", "definir estrategia". Si una tarea no se puede tachar de una lista tras hacerla, está mal.
- "description" opcional: detalle logístico (dónde, cuánto, con quién).
- "targetDate" opcional date-only ISO.

EJEMPLO de concreción (objetivo "Competir en el Mundial de la disciplina en el exterior"):
{ "keyResults": [
  { "title": "Visa y viaje", "tasks": [
    { "title": "Tramitar la eVisa en el portal oficial del país anfitrión" },
    { "title": "Comprar el pasaje aéreo ida y vuelta" },
    { "title": "Conseguir el dinero del pasaje (ahorro mensual + venta de equipo viejo)" }
  ] },
  { "title": "Inscripción a la competencia", "tasks": [
    { "title": "Pre-registrarme en el sitio del torneo antes del cierre" },
    { "title": "Pagar el fee de inscripción" },
    { "title": "Subir certificado médico y documentación requerida" }
  ] }
] }

REGLAS DE FECHAS:
- Si hay fecha objetivo: distribuí "targetDate" de las tareas de forma creciente entre hoy y la fecha objetivo (inclusive); ninguna posterior a la fecha objetivo ni anterior a hoy. Trámites y logística temprano; lo decisivo cerca del final.
- Si NO hay fecha objetivo: podés omitir "targetDate" (o ponerla sólo donde tenga sentido).

ESTILO: Español neutro. Realista para una persona real con tiempo y plata limitados. Cero relleno motivacional. SOLO el JSON.`

/** Arma el mensaje de usuario para Anthropic desde el objetivo. */
export function buildPlanInput(input: PlanPromptInput): string {
  const lines: string[] = [`Objetivo: "${input.title}".`]
  if (input.category) lines.push(`Dominio: ${input.category}.`)
  if (input.description) lines.push(`Descripción: ${input.description}`)
  lines.push(`Hoy es: ${input.today}.`)
  if (input.targetDate) {
    lines.push(
      `Fecha objetivo: ${input.targetDate}. Distribuí las fechas de las tareas entre hoy y esa fecha.`,
    )
  } else {
    lines.push('Sin fecha objetivo definida: las fechas de las tareas son opcionales.')
  }
  lines.push('', 'Devolvé el plan OKR en el JSON especificado: keyResults con sus tasks concretas.')
  return lines.join('\n')
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function cleanString(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : ''
}

function parseTask(item: unknown): ProposedTask | null {
  if (typeof item !== 'object' || item === null) return null
  const obj = item as Record<string, unknown>
  const title = cleanString(obj.title)
  if (!title) return null
  const description = cleanString(obj.description) || undefined
  const td = cleanString(obj.targetDate)
  const targetDate = ISO_DATE.test(td) ? td : undefined
  return { title, description, targetDate }
}

/**
 * Parsea la respuesta del LLM a ProposedKeyResult[]. Tolerante: extrae el primer
 * bloque { ... } y valida. Descarta KRs/tareas sin título; normaliza targetDate
 * (solo 'YYYY-MM-DD'). Un KR sin tareas válidas se conserva (KR sin tareas es
 * legítimo en el modelo). Devuelve [] si no hay nada usable.
 */
export function parseObjectivePlan(raw: string): ProposedKeyResult[] {
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
  const krsRaw = (parsed as { keyResults?: unknown }).keyResults
  if (!Array.isArray(krsRaw)) return []

  const out: ProposedKeyResult[] = []
  for (const item of krsRaw) {
    if (typeof item !== 'object' || item === null) continue
    const obj = item as Record<string, unknown>
    const title = cleanString(obj.title)
    if (!title) continue
    const description = cleanString(obj.description) || undefined
    const tasksRaw = Array.isArray(obj.tasks) ? obj.tasks : []
    const tasks: ProposedTask[] = []
    for (const t of tasksRaw) {
      const task = parseTask(t)
      if (task) tasks.push(task)
    }
    out.push({ title, description, tasks })
  }
  return out
}
