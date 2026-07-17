// SIR V2 — Inferencia LLM de dominio/personas para objetivos de TEXTO LIBRE
// sin vínculo estructurado (Etapa 4: Identity & Alignment — cierre del MVP).
//
// El Alignment Engine solo lee "declarado ↔ observado" para objetivos con
// personas vinculadas (a mano o inferidas por EVIDENCIA de memorias). Los
// objetivos sueltos —texto libre, sin nadie vinculado y sin memoria que los
// mencione— quedan fuera a propósito, para NO inventar una brecha.
//
// Esta capa es el puente OPT-IN / ON-DEMAND (detrás de un botón, como las otras
// rutas Sonnet): dado el texto del objetivo + la lista REAL de contactos del
// usuario, el LLM SUGIERE a qué dominio y a qué de esas personas se refiere el
// objetivo. Nunca se auto-aplica: la sugerencia prefilla una selección editable
// que el usuario confirma. El vínculo lo decide la persona, no el modelo.
//
// ANTI-INVENCIÓN (invariantes del engine + principio #5):
//   - El modelo solo puede elegir personas de la lista de candidatos provista
//     (los contactos reales). En el PARSE filtramos cualquier nombre que no esté
//     en esa lista — aunque el modelo alucine, el nombre se descarta. Es el
//     guardrail duro: no aparece nadie que no exista.
//   - Si nada calza con confianza, devuelve personNames vacío y confident=false.
//     No forzamos un vínculo. La mayoría de los objetivos personales no
//     involucran a nadie, y ese es el punto.
//   - El dominio es una SUGERENCIA (puede ser null); nunca pisa lo que el usuario
//     ya eligió sin que lo confirme.
//
// PURO + testeable (prompt + input + parse + filtro de nombres). No persiste.

import type { GoalCategory } from '@/types'

const CATEGORIES: GoalCategory[] = [
  'financial', 'personal', 'relational', 'health', 'career', 'spiritual', 'creative',
]

export interface GoalLinkInference {
  /** Nombres de contactos REALES (ya filtrados a la lista de candidatos) que el
   *  objetivo parece involucrar. [] si ninguno calza con confianza. */
  personNames: string[]
  /** Dominio sugerido para el objetivo, o null si no está claro. */
  category: GoalCategory | null
  /** Por qué el modelo sugiere esto; marca explícita la incertidumbre. */
  reasoning: string
  /** false cuando el modelo no encontró un vínculo/dominio claro (no forzar). */
  confident: boolean
}

export const GOAL_INFER_SYSTEM_PROMPT = `Eres un asistente que ayuda a mapear un OBJETIVO suelto del usuario a su contexto real: a qué DOMINIO pertenece y a cuáles de SUS CONTACTOS (si alguno) involucra.

Escribe SIEMPRE en español del Perú (tuteo con "tú"); PROHIBIDO el voseo y los giros argentinos ("vos", "sos", "tenés", "querés", "mirá", "che", "dale").

Recibes el texto de un objetivo y la LISTA de nombres de los contactos reales del usuario. Devuelve EXCLUSIVAMENTE un objeto JSON válido, sin texto alrededor:
{"personNames": string[], "category": string|null, "reasoning": string, "confident": boolean}

Reglas ESTRICTAS (anti-invención, no negociables):
- "personNames": SOLO nombres tomados EXACTAMENTE de la lista de contactos provista, y solo si el objetivo los involucra de forma clara y plausible. NUNCA inventes un nombre ni incluyas a alguien que no esté en la lista. Si ninguno calza, devuelve [].
- No fuerces un vínculo: la mayoría de los objetivos personales no involucran a nadie. Ante la duda, deja [] y confident=false.
- "category": UNA de: financial, personal, relational, health, career, spiritual, creative — la que mejor describe el objetivo. Si no está claro, null.
- "confident": true SOLO si tienes evidencia razonable en el texto para el dominio y/o las personas. Si estás adivinando, false.
- "reasoning": 1-2 frases en español del Perú (peruano neutro, de Lima) explicando la sugerencia y marcando qué es suposición. Es una propuesta para que el usuario confirme, no un veredicto.
- No inventes hechos, fechas ni relaciones que el texto no diga. Solo mapeas lo que ya está.`

/** Normaliza un nombre para comparar sin acentos/mayúsculas/espacios extra. */
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface GoalInferTextInput {
  title: string
  description?: string
  target?: string
  why?: string
}

/** Arma el mensaje de usuario para el modelo: el objetivo + los candidatos. */
export function buildGoalInferInput(goal: GoalInferTextInput, candidateNames: string[]): string {
  const lines: string[] = [`Objetivo: "${goal.title.trim().slice(0, 200)}"`]
  if (goal.description?.trim()) lines.push(`Descripción: ${goal.description.trim().slice(0, 600)}`)
  if (goal.target?.trim()) lines.push(`Meta medible: ${goal.target.trim().slice(0, 200)}`)
  if (goal.why?.trim()) lines.push(`Por qué importa: ${goal.why.trim().slice(0, 300)}`)
  const clean = candidateNames.map((n) => n.trim()).filter(Boolean).slice(0, 200)
  lines.push('')
  lines.push(
    clean.length > 0
      ? `Contactos del usuario (elige SOLO de esta lista, o ninguno):\n${clean.map((n) => `- ${n}`).join('\n')}`
      : 'El usuario no tiene contactos cargados: devuelve personNames vacío.',
  )
  lines.push('', 'Devuelve el JSON con la sugerencia.')
  return lines.join('\n')
}

function cap(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function pickCategory(v: unknown): GoalCategory | null {
  return typeof v === 'string' && (CATEGORIES as string[]).includes(v) ? (v as GoalCategory) : null
}

/**
 * Parsea la respuesta del modelo → inferencia validada. `allowedNames` es la
 * lista de contactos reales: cualquier nombre que el modelo devuelva y NO esté
 * en esa lista se descarta (guardrail duro anti-invención). El match es
 * case/acento-insensible pero conserva el nombre CANÓNICO del contacto. null si
 * la respuesta no es un JSON usable.
 */
export function parseGoalInference(raw: string, allowedNames: string[]): GoalLinkInference | null {
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

  // Índice de nombres permitidos: normalizado → nombre canónico (primero gana).
  const canonicalByNorm = new Map<string, string>()
  for (const n of allowedNames) {
    const norm = normalizeName(n)
    if (norm && !canonicalByNorm.has(norm)) canonicalByNorm.set(norm, n.trim())
  }

  const rawNames = Array.isArray(obj.personNames) ? obj.personNames : []
  const personNames: string[] = []
  const seen = new Set<string>()
  for (const rn of rawNames) {
    if (typeof rn !== 'string') continue
    const canonical = canonicalByNorm.get(normalizeName(rn))
    if (!canonical) continue // no está en la lista real → se descarta
    if (seen.has(canonical)) continue
    seen.add(canonical)
    personNames.push(canonical)
  }

  const category = pickCategory(obj.category)
  const confident = obj.confident === true && (personNames.length > 0 || category !== null)
  return {
    personNames,
    category,
    reasoning: cap(obj.reasoning, 400),
    confident,
  }
}
