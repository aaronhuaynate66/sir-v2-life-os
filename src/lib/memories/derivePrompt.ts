// SIR V2 — Prompt + parser de la síntesis de memorias desde observations.
//
// El route arma el input desde ObservationDigest[] y le pide a Anthropic una
// lista de memorias notables en JSON. El parser es PURO y tolerante (extrae
// el primer bloque JSON aunque venga con texto alrededor) → testeable.
//
// INVARIANTES (#1 bienestar, #5 correlación ≠ causa / no diagnóstico):
//   - Sólo hechos presentes en el material. No inventar.
//   - Sin diagnóstico clínico, etiquetas de salud mental ni consejo médico.
//   - Sin causalidad ni predicción. Observacional, sobrio, sin dramatizar.

import type { ObservationDigest } from './deriveFromObservations'
import type { DerivedMemoryItem } from './deriveFromObservations'

export const DERIVE_MEMORIES_SYSTEM_PROMPT = `Eres el módulo de memoria de SIR, un sistema operativo personal centrado en el bienestar.

Recibís un conjunto de observaciones ya capturadas sobre una persona (conversaciones, perfiles, notas), cada una con un índice. Tu tarea: destilar las MEMORIAS NOTABLES — momentos, temas recurrentes o hechos significativos del vínculo — en una lista JSON.

Devolvé EXCLUSIVAMENTE un objeto JSON con esta forma (sin texto adicional, sin markdown):
{
  "memories": [
    {
      "observationIndex": 0,
      "type": "episodic" | "semantic" | "emotional" | "social",
      "title": "string corto",
      "content": "1-2 oraciones, en tercera persona, factual",
      "emotionalCharge": -10..10,
      "importance": 1..5,
      "tags": ["string", ...]
    }
  ]
}

REGLAS ESTRICTAS:
- Máximo 2 memorias por observación. Si una observación no aporta nada notable, omitila.
- "observationIndex" DEBE ser el índice de una observación provista.
- Usá SOLO información presente en el material. PROHIBIDO inventar hechos, nombres, fechas o sentimientos no expresados.
- PROHIBIDO: diagnóstico clínico, etiquetas de salud mental, consejo médico/psicológico, afirmaciones de causa-efecto, predicciones.
- "type": 'emotional' SOLO si la observación reporta un estado emocional explícito.
- Tono observacional y sobrio, sin dramatizar. Español neutro.
- Si no hay nada notable en todo el conjunto, devolvé {"memories": []}.`

/** Construye el mensaje de usuario con las observaciones indexadas. */
export function buildDeriveInput(personName: string, digests: ObservationDigest[]): string {
  const blocks = digests.map((d) => {
    const lines: string[] = [
      `#${d.index} [${d.captureType}] ${d.observedAt}`,
    ]
    if (d.text) lines.push(`  texto: ${d.text}`)
    if (d.topics.length > 0) lines.push(`  temas: ${d.topics.join(', ')}`)
    if (d.emotionalUser) lines.push(`  estado (usuario): ${d.emotionalUser}`)
    if (d.emotionalOther) lines.push(`  estado (${personName}): ${d.emotionalOther}`)
    return lines.join('\n')
  })
  return `Persona: ${personName}\n\nObservaciones:\n${blocks.join('\n\n')}\n\nDestilá las memorias notables en el JSON especificado.`
}

/**
 * Parsea la respuesta del LLM a DerivedMemoryItem[]. Tolerante: extrae el
 * primer bloque {...} aunque venga con prosa o fences. Devuelve [] si no hay
 * JSON válido o la forma no calza (el caller cae al fallback determinístico).
 */
export function parseDeriveResponse(raw: string): DerivedMemoryItem[] {
  if (!raw || typeof raw !== 'string') return []
  // Tomar desde el primer "{" hasta el último "}" (tolera fences ```json).
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return []
  }
  const memories = (parsed as { memories?: unknown })?.memories
  if (!Array.isArray(memories)) return []

  const out: DerivedMemoryItem[] = []
  for (const m of memories) {
    if (typeof m !== 'object' || m === null) continue
    const obj = m as Record<string, unknown>
    if (typeof obj.observationIndex !== 'number') continue
    out.push({
      observationIndex: obj.observationIndex,
      type: typeof obj.type === 'string' ? obj.type : undefined,
      title: typeof obj.title === 'string' ? obj.title : undefined,
      content: typeof obj.content === 'string' ? obj.content : undefined,
      emotionalCharge:
        typeof obj.emotionalCharge === 'number' ? obj.emotionalCharge : undefined,
      importance: typeof obj.importance === 'number' ? obj.importance : undefined,
      tags: Array.isArray(obj.tags)
        ? obj.tags.filter((t): t is string => typeof t === 'string')
        : undefined,
    })
  }
  return out
}
