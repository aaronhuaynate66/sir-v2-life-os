// SIR V2 — Prompt + parser del helper IA "Hacer SMART" para objetivos.
//
// Toma un objetivo redactado en bruto (título + descripción + dominio + fecha?)
// y propone su versión SMART: el QUÉ afinado (`specific`), una métrica/resultado
// MEDIBLE (`target`), dónde estás hoy (`baseline`), por qué importa (`why`) y, si
// no hay fecha, una fecha sugerida realista. NO autoguarda: la UI (wizard guiado
// / helper inline) muestra la propuesta para revisar/editar/aceptar o descartar
// (review-before-save).
//
// Dos modos de entrada (no excluyentes):
//   - normal   : título + descripción + dominio + fecha → afina y completa.
//   - dictation: un PÁRRAFO en lenguaje natural → extrae todos los campos SMART
//                para pre-llenar el wizard ("dictarlo todo de una").
//
// `context` (grounding ya resumido) es el DIFERENCIADOR del baseline: cuando se
// pasa, el modelo propone el punto de partida desde la data REAL del usuario
// (finanzas/peso/bienestar/señales) en vez de pedírselo o inventarlo.
//
// INVARIANTES:
//   - `target` es medible y verificable: un número/umbral/estado, no una vaguedad.
//   - `baseline` se infiere del `context` (data real) o de lo que dio el usuario;
//     si no hay forma de saberlo, queda vacío (NO se inventa un número).
//   - `why` es la relevancia concreta para la persona, no relleno motivacional.
//   - Devuelve SOLO JSON; el parser es tolerante a ruido/markdown.

export interface SmartPromptInput {
  title: string
  description?: string
  category?: string
  /** Fecha objetivo actual (date-only ISO), si ya existe. */
  targetDate?: string
  /** Hoy (date-only ISO) para acotar la fecha sugerida. */
  today: string
  /** Grounding resumido (data real). Si está, el baseline se propone de ahí. */
  context?: string
  /** Párrafo libre del usuario ("dictarlo todo de una") del que extraer los campos. */
  dictation?: string
}

/** Definición SMART propuesta (aún no persistida). */
export interface ProposedSmart {
  /** Specific: el QUÉ afinado (título más nítido). Vacío → la UI cae al título actual. */
  specific?: string
  /** Métrica/resultado medible. */
  target: string
  /** Punto de partida actual. Vacío si no se puede inferir. */
  baseline?: string
  /** Por qué importa. */
  why: string
  /** Fecha sugerida date-only ISO (solo si el objetivo no traía una). */
  suggestedTargetDate?: string
}

export const OBJECTIVE_SMART_SYSTEM_PROMPT = `Eres el módulo de Planificación de SIR, un sistema operativo personal centrado en el bienestar y la acción.

Recibís un objetivo (a veces redactado en bruto: título, descripción, dominio y fecha; a veces como un párrafo libre que dictó el usuario). Tu tarea: convertirlo en un objetivo SMART, definiendo lo que falta para que sea específico, medible, relevante y con plazo.

Devolvé EXCLUSIVAMENTE un objeto JSON (sin texto adicional, sin markdown, sin comentarios):
{ "specific": "...", "target": "...", "baseline": "...", "why": "...", "suggestedTargetDate": "YYYY-MM-DD" }

REGLAS:
- "specific" (Specific): el QUÉ querés lograr, en una frase nítida y breve (sirve como título afinado). Quitá lo ambiguo. Si el título ya es claro, podés devolverlo casi igual. Máx ~80 caracteres.
- "target" (Measurable): el RESULTADO MEDIBLE que define "logrado". Un número, umbral o estado verificable. Ej.: "Pesar 75 kg", "Ahorrar S/5000", "Correr 10 km sin parar", "Cerrar 3 clientes nuevos". PROHIBIDO lo vago ("estar en forma", "mejorar mis finanzas"): convertilo en algo que se pueda tachar como hecho o no.
- "baseline": el PUNTO DE PARTIDA actual respecto del target. Si te dan "DATOS REALES DEL USUARIO", inferí el baseline DE AHÍ (ej. peso actual de la báscula, ahorro/balance del mes, nivel de una métrica) — es lo que SIR ya sabe, no se lo vuelvas a preguntar. Si no, usá lo que dijo el usuario. Si no hay forma de saberlo, dejalo en "" (string vacío). NUNCA inventes un número.
- "why" (Relevant): por qué este objetivo importa para esta persona, en una frase concreta y honesta. Nada de frases motivacionales genéricas.
- "suggestedTargetDate": SOLO si el objetivo NO traía fecha. Proponé una fecha realista (date-only ISO) posterior a hoy, acorde a la ambición del target. Si ya traía fecha, devolvé "" .
- Español neutro. Realista. SOLO el JSON.`

/** Arma el mensaje de usuario para Anthropic desde el objetivo (modo normal o dictado). */
export function buildSmartInput(input: SmartPromptInput): string {
  const lines: string[] = []
  const dictation = input.dictation?.trim()
  if (dictation) {
    lines.push('El usuario dictó su objetivo en lenguaje natural; extraé los campos SMART de este texto:')
    lines.push(`"""${dictation}"""`)
    if (input.title.trim()) lines.push(`Título tentativo previo: "${input.title}".`)
  } else {
    lines.push(`Objetivo (en bruto): "${input.title}".`)
  }
  if (input.category) lines.push(`Dominio: ${input.category}.`)
  if (input.description) lines.push(`Descripción: ${input.description}`)
  lines.push(`Hoy es: ${input.today}.`)
  if (input.targetDate) {
    lines.push(`Ya tiene fecha objetivo: ${input.targetDate}. No sugieras otra (devolvé suggestedTargetDate = "").`)
  } else {
    lines.push('No tiene fecha objetivo: sugerí una realista en suggestedTargetDate.')
  }
  const context = input.context?.trim()
  if (context) {
    lines.push('', context, '', 'Inferí "baseline" de esos DATOS REALES cuando apliquen al target.')
  }
  lines.push('', 'Devolvé la definición SMART en el JSON especificado.')
  return lines.join('\n')
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function cleanString(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : ''
}

/**
 * Parsea la respuesta del LLM a ProposedSmart. Tolerante: extrae el primer
 * bloque { ... }. Devuelve null si no hay un `target` usable (sin métrica no hay
 * SMART). `baseline`/`suggestedTargetDate` vacíos → undefined.
 */
export function parseSmart(raw: string): ProposedSmart | null {
  if (!raw || typeof raw !== 'string') return null
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const obj = parsed as Record<string, unknown>
  const target = cleanString(obj.target)
  if (!target) return null
  const specific = cleanString(obj.specific) || undefined
  const baseline = cleanString(obj.baseline) || undefined
  const why = cleanString(obj.why)
  const std = cleanString(obj.suggestedTargetDate)
  const suggestedTargetDate = ISO_DATE.test(std) ? std : undefined
  return { specific, target, baseline, why, suggestedTargetDate }
}
