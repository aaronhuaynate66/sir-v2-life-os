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
//   - Cada tarea trae además: acceptanceCriteria (definición de hecho), effort
//     (S/M/L) y priority (low/med/high) → tareas ejecutables "Jira-light".
//   - Devuelve SOLO JSON; el parser es tolerante a ruido/markdown.

import type { TaskEffort, TaskPriority } from '@/types'

export interface PlanPromptInput {
  title: string
  description?: string
  category?: string
  /** Fecha objetivo del objetivo (date-only ISO 'YYYY-MM-DD'), si existe. */
  targetDate?: string
  /** SMART: métrica/resultado medible (ej. "Pesar 75 kg"). */
  target?: string
  /** SMART: punto de partida actual (ej. "82 kg"). */
  baseline?: string
  /** SMART: por qué importa. */
  why?: string
  /** Grounding: bloque de texto con la data real del usuario (finanzas, /yo,
   *  señales, personas). Ya resumido — ver lib/objectives/grounding.ts. */
  context?: string
  /** Fecha de hoy (date-only ISO), para acotar el rango sugerido. */
  today: string
}

/** Tarea propuesta (hoja del plan, aún no persistida). */
export interface ProposedTask {
  title: string
  description?: string
  /** Fecha sugerida date-only ISO, opcional (= due date). */
  targetDate?: string
  /** Definición de hecho verificable ("visa aprobada y en pasaporte"). */
  acceptanceCriteria?: string
  /** Estimación de esfuerzo camiseta. */
  effort?: TaskEffort
  /** Prioridad sugerida. */
  priority?: TaskPriority
}

/** Resultado Clave propuesto, con sus tareas (aún no persistido). */
export interface ProposedKeyResult {
  title: string
  description?: string
  tasks: ProposedTask[]
}

export const OBJECTIVE_PLAN_SYSTEM_PROMPT = `Eres el módulo de Planificación de SIR, un sistema operativo personal centrado en el bienestar y la acción. Pensás como un buen project manager: convertís un objetivo en un plan EJECUTABLE.

Recibís UN objetivo declarado por el usuario (título, descripción, dominio, su definición SMART si existe, una fecha objetivo si existe) y, cuando hay, un bloque de DATOS REALES del usuario (finanzas, cuerpo/báscula, bienestar, señales, personas). Tu tarea: descomponerlo en un plan OKR de DOS niveles APOYADO en esos datos, y devolver notas de viabilidad aterrizadas.

Devolvé EXCLUSIVAMENTE un objeto JSON (sin texto adicional, sin markdown, sin comentarios):
{ "keyResults": [ { "title": "...", "description": "...", "tasks": [ { "title": "...", "description": "...", "acceptanceCriteria": "...", "targetDate": "YYYY-MM-DD", "effort": "S|M|L", "priority": "low|med|high" } ] } ], "feasibility": [ "nota corta aterrizada en los datos", "..." ] }

NIVEL 1 — RESULTADOS CLAVE (keyResults):
- Entre 2 y 5. Cada uno es un OUTCOME o ÁREA medible que, completada, acerca el objetivo. NO es una acción.
- "title" corto, sustantivo/resultado (ej. "Visa y viaje", "Inscripción a la competencia", "Estado físico competitivo"). Máx ~60 caracteres.
- "description" opcional: una frase que aclare qué significa "logrado" para ese KR.

NIVEL 2 — TAREAS (tasks dentro de cada KR):
- Entre 2 y 6 por KR. Son las ACCIONES CONCRETAS Y LOGÍSTICAS para lograr ese KR.
- Cada "title" empieza con un VERBO de acción ejecutable y describe algo que una persona REALMENTE hace en el mundo: trámites, compras, pagos, reservas, llamados, registros, citas. Máx ~90 caracteres.
- PROHIBIDO lo vago/abstracto: NADA de "evaluar requisitos", "investigar opciones", "analizar", "diseñar un programa", "prepararse", "planificar", "definir estrategia". Si una tarea no se puede tachar de una lista tras hacerla, está mal.
- "description" opcional: detalle logístico (dónde, cuánto, con quién).
- "acceptanceCriteria" (recomendado): la DEFINICIÓN DE HECHO verificable de esa tarea — cómo sabés objetivamente que quedó terminada. Es un ESTADO observable, no una acción ni una repetición del título. Ej.: para "Tramitar la eVisa" → "eVisa aprobada y guardada en PDF". Máx ~120 caracteres.
- "effort" (recomendado): esfuerzo estimado, uno de "S" (rápido, <1h o trivial), "M" (medio, algunas horas/un día), "L" (grande, varios días o costoso/complejo).
- "priority" (recomendado): "high" (en el camino crítico o con deadline cercano), "med" (importante, no urgente), "low" (deseable/secundaria).
- "targetDate" opcional date-only ISO.

EJEMPLO de concreción (objetivo "Competir en el Mundial de la disciplina en el exterior"):
{ "keyResults": [
  { "title": "Visa y viaje", "tasks": [
    { "title": "Tramitar la eVisa en el portal oficial del país anfitrión", "acceptanceCriteria": "eVisa aprobada y guardada en PDF", "effort": "M", "priority": "high" },
    { "title": "Comprar el pasaje aéreo ida y vuelta", "acceptanceCriteria": "Boleto emitido y con localizador confirmado", "effort": "S", "priority": "high" },
    { "title": "Conseguir el dinero del pasaje (ahorro mensual + venta de equipo viejo)", "acceptanceCriteria": "Monto del pasaje juntado en la cuenta", "effort": "L", "priority": "med" }
  ] },
  { "title": "Inscripción a la competencia", "tasks": [
    { "title": "Pre-registrarme en el sitio del torneo antes del cierre", "acceptanceCriteria": "Registro confirmado por email", "effort": "S", "priority": "high" },
    { "title": "Pagar el fee de inscripción", "acceptanceCriteria": "Pago acreditado y comprobante recibido", "effort": "S", "priority": "high" },
    { "title": "Subir certificado médico y documentación requerida", "acceptanceCriteria": "Documentos aceptados por la organización", "effort": "M", "priority": "med" }
  ] }
] }

REGLAS DE FECHAS:
- Si hay fecha objetivo: distribuí "targetDate" de las tareas de forma creciente entre hoy y la fecha objetivo (inclusive); ninguna posterior a la fecha objetivo ni anterior a hoy. Trámites y logística temprano; lo decisivo cerca del final.
- Si NO hay fecha objetivo: podés omitir "targetDate" (o ponerla sólo donde tenga sentido).

GROUNDING (apoyate en los DATOS REALES, si vienen):
- El plan debe reflejar la realidad del usuario. Si hay un costo o ingreso conocido (ej. ahorro de S/X/mes), aterrizá las tareas a eso.
- NO inventes cifras que no tenés. Si te falta un dato clave para avanzar (ej. el costo del pasaje o del fee), creá una tarea concreta para CONSEGUIRLO ("Cotizar el pasaje…", "Averiguar el fee de inscripción…") en vez de poner un número inventado.
- Usá sólo lo que aporta al objetivo: no metas datos irrelevantes (ej. señales sin relación).

FEASIBILITY ("feasibility"): 1 a 4 notas CORTAS, cada una aterrizada en un dato real concreto. Ejemplos del tono:
- "Con tu cashflow (+S/X/mes) y el costo estimado, te faltarían ~S/Z; cubrir eso toma ~N meses."
- "Tu último peso fue Ykg — estás ~N kg sobre la categoría objetivo."
- "Tu energía/sueño viene bajo (V/10) para sostener esta carga; ojo con el ritmo."
Si NO hay datos reales suficientes para una nota honesta, devolvé "feasibility": [] (NO inventes feasibility).

ESTILO: Español neutro. Realista para una persona real con tiempo y plata limitados. Cero relleno motivacional. SOLO el JSON.`

/** Arma el mensaje de usuario para Anthropic desde el objetivo. */
export function buildPlanInput(input: PlanPromptInput): string {
  const lines: string[] = [`Objetivo: "${input.title}".`]
  if (input.category) lines.push(`Dominio: ${input.category}.`)
  if (input.description) lines.push(`Descripción: ${input.description}`)
  if (input.target) lines.push(`Meta medible (target): ${input.target}.`)
  if (input.baseline) lines.push(`Punto de partida (hoy): ${input.baseline}.`)
  if (input.why) lines.push(`Por qué importa: ${input.why}`)
  lines.push(`Hoy es: ${input.today}.`)
  if (input.targetDate) {
    lines.push(
      `Fecha objetivo: ${input.targetDate}. Distribuí las fechas de las tareas entre hoy y esa fecha.`,
    )
  } else {
    lines.push('Sin fecha objetivo definida: las fechas de las tareas son opcionales.')
  }
  if (input.context && input.context.trim()) {
    lines.push('', input.context.trim())
  }
  lines.push('', 'Devolvé el plan OKR + feasibility en el JSON especificado: keyResults con sus tasks concretas (cada tarea con acceptanceCriteria, effort y priority), y feasibility aterrizada en los datos reales (o [] si no hay datos).')
  return lines.join('\n')
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function cleanString(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : ''
}

/**
 * Extrae el primer objeto JSON balanceado de la respuesta del LLM, de forma
 * ROBUSTA frente a las formas que devuelven los modelos:
 *   - fences ```json … ``` (o ``` … ```),
 *   - prosa antes/después del objeto ("Claro, acá tenés: { … } ¡Éxitos!"),
 *   - llaves dentro de strings (no rompen el conteo de profundidad),
 *   - comas colgantes (trailing commas) antes de } o ] → segundo intento las saca.
 * Devuelve el objeto parseado o null si no hay un objeto COMPLETO y parseable
 * (p. ej. respuesta truncada a la mitad → null → el caller reintenta).
 */
export function extractJsonObject(raw: string): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'string') return null
  const candidate = balancedObject(raw)
  if (!candidate) return null
  for (const attempt of [candidate, stripTrailingCommas(candidate)]) {
    try {
      const parsed = JSON.parse(attempt)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      /* probamos el próximo saneo */
    }
  }
  return null
}

/** Primer objeto `{…}` balanceado (ignora llaves dentro de strings). null si
 *  no hay apertura o si nunca se cierra (truncado). */
function balancedObject(s: string): string | null {
  const start = s.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null // nunca cerró → truncado
}

/** Saca comas colgantes antes de } o ] (algunos modelos las dejan). */
function stripTrailingCommas(s: string): string {
  return s.replace(/,(\s*[}\]])/g, '$1')
}

/**
 * Nudge para el reintento server-side: se concatena al mensaje cuando el primer
 * intento vino vacío/no-parseable (p. ej. truncado). Pide JSON COMPLETO y
 * conciso para no volver a pasarse de largo.
 */
export const OBJECTIVE_PLAN_RETRY_NUDGE = `IMPORTANTE: tu salida debe ser EXCLUSIVAMENTE un objeto JSON válido y COMPLETO (todas las llaves y corchetes cerrados), sin ningún texto fuera del JSON ni fences \`\`\`. Sé CONCISO para que entre completo: 3 a 4 keyResults, 3 a 4 tasks por keyResult, títulos cortos y descripciones breves u omitidas. En cada tarea incluí "acceptanceCriteria" (breve), "effort" (S/M/L) y "priority" (low/med/high). Incluí al menos 3 keyResults.`

const VALID_EFFORT: readonly TaskEffort[] = ['S', 'M', 'L']
const VALID_PRIORITY: readonly TaskPriority[] = ['low', 'med', 'high']

/** Normaliza un enum del LLM: matchea case-insensitive, descarta lo inválido. */
function parseEnum<T extends string>(raw: unknown, valid: readonly T[]): T | undefined {
  const s = cleanString(raw)
  if (!s) return undefined
  const hit = valid.find((v) => v.toLowerCase() === s.toLowerCase())
  return hit
}

function parseTask(item: unknown): ProposedTask | null {
  if (typeof item !== 'object' || item === null) return null
  const obj = item as Record<string, unknown>
  const title = cleanString(obj.title)
  if (!title) return null
  const description = cleanString(obj.description) || undefined
  const td = cleanString(obj.targetDate)
  const targetDate = ISO_DATE.test(td) ? td : undefined
  const acceptanceCriteria = cleanString(obj.acceptanceCriteria) || undefined
  const effort = parseEnum<TaskEffort>(obj.effort, VALID_EFFORT)
  const priority = parseEnum<TaskPriority>(obj.priority, VALID_PRIORITY)
  return { title, description, targetDate, acceptanceCriteria, effort, priority }
}

/**
 * Parsea la respuesta del LLM a ProposedKeyResult[]. Tolerante: extrae el primer
 * bloque { ... } y valida. Descarta KRs/tareas sin título; normaliza targetDate
 * (solo 'YYYY-MM-DD'). Un KR sin tareas válidas se conserva (KR sin tareas es
 * legítimo en el modelo). Devuelve [] si no hay nada usable.
 */
export function parseObjectivePlan(raw: string): ProposedKeyResult[] {
  const parsed = extractJsonObject(raw)
  if (!parsed) return []
  const krsRaw = parsed.keyResults
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

/**
 * Extrae las notas de feasibility (array de strings) del mismo bloque JSON.
 * Tolerante: si no hay `feasibility` array, o ninguna nota usable, devuelve [].
 * Recorta y descarta entradas vacías; tope de 6 notas para no inundar la UI.
 */
export function parseFeasibilityNotes(raw: string): string[] {
  const parsed = extractJsonObject(raw)
  if (!parsed) return []
  const notesRaw = parsed.feasibility
  if (!Array.isArray(notesRaw)) return []
  const notes: string[] = []
  for (const n of notesRaw) {
    const s = cleanString(n)
    if (s) notes.push(s)
    if (notes.length >= 6) break
  }
  return notes
}
