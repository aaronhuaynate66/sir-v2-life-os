// SIR V2 — Prompt del mensaje copiable de Daily Actions (GEMA A, capa IA).
//
// La gema de v1: el LLM no da "consejos genéricos", devuelve un MENSAJE LISTO
// para copiar y enviar SIN editar, con el contexto real de la persona. Portado
// de `acciones/generate.ts:302-318` (SYSTEM JSON estricto, Haiku) y envuelto
// con los invariantes observacionales de V2 (sin diagnóstico, bienestar >
// engagement). Una sola persona por llamada → barato, rápido, sin timeout.
//
// PURO: sólo construcción de prompt + parseo tolerante. Sin I/O. Testeable.

export interface MessageContextInput {
  personName: string
  /** family | friend | romantic | professional | mentor | mentee | acquaintance */
  relationship: string
  /** Categoría del vínculo (círculo íntimo / cercano / red / periférico). */
  categoryLabel: string
  /** Por qué ahora (el `headline` de la DailyAction). */
  reason: string
  /** Tipo de acción (contacto / cumpleaños / fecha / destensar / reconocer). */
  kindLabel: string
  /** Días desde la última interacción. null = nunca. */
  daysSinceContact: number | null
  /** Días hasta la fecha relevante (cumpleaños/aniversario), si aplica. */
  daysUntil?: number | null
  /** Ubicación, si se conoce (color de contexto). */
  location?: string | null
  /** Notas libres de la persona (contexto que el usuario ya cargó). */
  notes?: string | null
}

export interface MessageSuggestion {
  action_text: string
  timing_reason: string
  message_suggestion: string
  impact_prediction: string
}

export const MESSAGE_SYSTEM_PROMPT = `Eres el asistente relacional de Aaron. Generás UN mensaje listo para enviar a un contacto suyo, en su nombre.

Devolvé ÚNICAMENTE JSON válido, sin markdown ni explicaciones. Schema EXACTO:
{
  "action_text": "qué hacer hoy, máx 12 palabras, imperativo",
  "timing_reason": "por qué ahora y no después, máx 20 palabras",
  "message_suggestion": "el mensaje EXACTO a enviar, personalizado con el contexto real",
  "impact_prediction": "qué gana si lo hace / qué arriesga si no, máx 30 palabras"
}

Reglas estrictas:
- message_suggestion debe ser copiable y enviable SIN edición. Escribilo como lo escribiría una persona real por WhatsApp: cálido, natural, en español rioplatense neutro, 1-3 frases.
- Usá el nombre real y el contexto provisto. Nada de "reconéctate con tu red" ni consejos genéricos.
- Si es un cumpleaños/fecha, que el mensaje sea un saludo concreto para ESA fecha.
- No inventes datos que no estén en el contexto (ni trabajos, ni eventos, ni nombres de terceros).
- Tono que respeta el vínculo y el bienestar de ambos; sin presión, sin culpa, sin diagnósticos.
- Idioma: español.`

function daysPhrase(days: number | null): string {
  if (days === null) return 'nunca registrado'
  if (days === 0) return 'hoy'
  if (days === 1) return 'hace 1 día'
  return `hace ${days} días`
}

/** Empaqueta el contexto de UNA persona para el prompt del mensaje. */
export function buildMessageContext(input: MessageContextInput): string {
  const lines: string[] = [
    `Persona: ${input.personName}`,
    `Vínculo: ${input.relationship} · ${input.categoryLabel}`,
    `Tipo de acción: ${input.kindLabel}`,
    `Por qué ahora: ${input.reason}`,
    `Última interacción: ${daysPhrase(input.daysSinceContact)}`,
  ]
  if (typeof input.daysUntil === 'number') {
    lines.push(
      input.daysUntil === 0
        ? 'La fecha es HOY.'
        : `Faltan ${input.daysUntil} día${input.daysUntil === 1 ? '' : 's'} para la fecha.`,
    )
  }
  if (input.location) lines.push(`Ubicación: ${input.location}`)
  if (input.notes && input.notes.trim()) lines.push(`Notas del contacto: ${input.notes.trim().slice(0, 280)}`)
  return lines.join('\n')
}

/** Parseo tolerante del JSON del modelo (directo, en bloque ```, o embebido). */
export function parseMessageJson(text: string): MessageSuggestion | null {
  const attempt = (s: string): MessageSuggestion | null => {
    try {
      const parsed = JSON.parse(s) as Record<string, unknown>
      if (typeof parsed.message_suggestion === 'string' && parsed.message_suggestion.trim()) {
        return {
          action_text: str(parsed.action_text),
          timing_reason: str(parsed.timing_reason),
          message_suggestion: str(parsed.message_suggestion),
          impact_prediction: str(parsed.impact_prediction),
        }
      }
    } catch {
      /* sigue */
    }
    return null
  }

  const direct = attempt(text)
  if (direct) return direct

  const block = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
  if (block?.[1]) {
    const r = attempt(block[1])
    if (r) return r
  }

  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start) return attempt(text.slice(start, end + 1))

  return null
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}
