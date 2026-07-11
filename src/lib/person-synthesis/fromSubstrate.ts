// SIR V2 — "Lo personal" desde el SUSTRATO (chat_messages) en vez del resumen.
//
// Cuando una persona tiene su hilo en el sustrato canónico (mig 0141), la síntesis
// se genera leyendo una muestra REAL y RECIENTE de los mensajes textuales, no el
// resumen con pérdida de la observación. Estos helpers son PUROS (testeables); la
// llamada al LLM vive en el route (/api/person-synthesis).

import type { ChatMsgRow } from '@/lib/chat-messages/read'

const OWNER_LABEL = 'Aaron'
const DEFAULT_BUDGET = 14_000

/** System prompt para sintetizar "Lo personal" desde el TRANSCRIPT crudo. Misma
 *  voz/estructura/invariantes que el de resúmenes, pero lee mensajes textuales. */
export const SUBSTRATE_SYNTHESIS_SYSTEM = `Eres el módulo de síntesis relacional de SIR, un sistema operativo personal.

Tu tarea: escribir un retrato narrativo breve del vínculo entre el usuario (Aaron) y una persona, leyendo una MUESTRA REAL Y RECIENTE de su conversación de WhatsApp (mensajes textuales). La muestra es reciente: refleja el estado ACTUAL del vínculo.

ESTRUCTURA — exactamente 3 párrafos cortos (2-4 oraciones cada uno), en español neutro:
1. La dinámica ACTUAL del vínculo y el tono emocional predominante hoy.
2. Los temas recurrentes, patrones, predisposiciones o riesgos conductuales que se ven en cómo hablan.
3. Cómo se manifiesta la conexión hoy (cercanía, reciprocidad, cuidado mutuo, fricciones, riesgos o abordaje recomendado).

REGLAS ESTRICTAS:
- Basate SOLO en lo que se ve en los mensajes. No inventes hechos, nombres, fechas ni eventos que no estén en la muestra.
- Permitido: hipótesis de predisposición, riesgo o patrón compatible cuando la muestra lo sostenga; separá evidencia/confianza y mantené alternativas posibles.
- PROHIBIDO: presentar diagnósticos clínicos como hechos confirmados, consejo médico o psicológico, predicciones cerradas sobre la relación.
- Si la muestra es pobre o repetitiva (solo logística, saludos), decilo con honestidad y escribí menos.
- Tono cálido y respetuoso, nunca dramático ni alarmista. Bienestar, no enganche.

FORMATO DE SALIDA:
- SOLO los 3 párrafos en texto plano, separados por una línea en blanco.
- Sin títulos, sin markdown, sin viñetas, sin comillas envolventes.`

/** Arma un transcript "Autor: texto" con la cola MÁS RECIENTE hasta `budget`
 *  caracteres. Filtra media/vacíos. Entra ascendente (cronológico), sale
 *  ascendente. PURO. */
export function buildTranscriptSample(rows: ChatMsgRow[], personName: string, budget: number = DEFAULT_BUDGET): string {
  const lines = rows
    .filter((r) => r.is_media !== true && (r.content ?? '').trim() && (r.content ?? '').trim() !== '[media]')
    .map((r) => `${r.sender === 'user' ? OWNER_LABEL : personName}: ${(r.content ?? '').replace(/\s+/g, ' ').trim()}`)
  const out: string[] = []
  let total = 0
  for (let i = lines.length - 1; i >= 0; i--) {
    total += lines[i].length + 1
    if (total > budget) break
    out.unshift(lines[i])
  }
  return out.join('\n')
}

/** Construye el mensaje de usuario para el modelo con el transcript real. PURO. */
export function buildSubstrateUserMessage(
  personName: string,
  transcript: string,
  count: number,
  first: string | null,
  last: string | null,
  goalContext?: string | null,
): string {
  const parts: string[] = [`Persona: ${personName}`]
  if (goalContext) {
    parts.push('', 'OBJETIVOS DEL USUARIO VINCULADOS A ESTA PERSONA (reflejá el estado del vínculo respecto de esto, sin inventar señales):', goalContext)
  }
  const span = first && last ? `, del ${first} al ${last}` : ''
  parts.push(
    '',
    `Muestra reciente y textual de la conversación real de WhatsApp entre Aaron y ${personName} (${count} mensajes${span}):`,
    '',
    transcript,
    '',
    `Escribí los 3 párrafos de "Lo personal" sobre ${personName}.`,
  )
  return parts.join('\n')
}
