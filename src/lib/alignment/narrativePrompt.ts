// SIR V2 — Prompt + parser de la narrativa de alineación (Etapa 4 MVP).
//
// La capa narrativa NO decide la brecha: recibe el estado y las señales YA
// computadas con datos reales por el alignment engine y sólo los REFORMULA en
// un insight breve y reflexivo. Esto garantiza que el "veredicto" se apoye en
// datos, no en invención del LLM.
//
// INVARIANTES DUROS (principio #3 "la IA asiste, no controla" + #5 del roadmap):
//   - Framing reflexivo y de APOYO. NUNCA culpabilizador ni con vergüenza.
//   - Correlación ≠ causa. Sin diagnóstico, sin etiquetas, sin predicción.
//   - Ofrece perspectiva, no dicta. El usuario siempre puede revisar/descartar.
//   - Sólo habla de las señales provistas. No inventa hechos nuevos.
//
// El caller NO debe invocar esto con estado 'insufficient_data' (se corta
// antes y se muestra "datos insuficientes"): sin señales no hay narrativa.

import type { AlignmentState, ConcernLevel } from '@/engines/alignment'

export const ALIGNMENT_NARRATIVE_SYSTEM_PROMPT = `Eres el módulo de Alineación de SIR, un sistema operativo personal centrado en el bienestar.

Recibís UN objetivo declarado por el usuario y un conjunto de señales OBSERVADAS reales (frecuencia de contacto, estado de relaciones, impacto energético) que ya fueron evaluadas. Tu tarea: devolver UN insight breve y reflexivo que ayude al usuario a notar la relación entre lo que declaró querer y lo que muestran sus señales.

Devolvé EXCLUSIVAMENTE un objeto JSON (sin texto adicional, sin markdown):
{ "insight": "2 a 3 oraciones en español neutro" }

INVARIANTES ESTRICTOS (no negociables):
- Tono REFLEXIVO y de APOYO. JAMÁS culpabilizador, moralizante ni con vergüenza. No uses "deberías", "fallaste", "estás mal".
- Es una OBSERVACIÓN para pensar, no un juicio ni una orden. Ofrecé perspectiva, no dictes qué hacer.
- PROHIBIDO afirmar causa-efecto ("esto causó", "por esto"). Correlación ≠ causa. Las señales acompañan o se desvían; no explican el porqué.
- PROHIBIDO diagnóstico, etiquetas de salud mental, consejo clínico, o predicciones del futuro.
- Hablá SOLO de las señales provistas. No inventes hechos, personas, fechas ni sentimientos no listados.
- Recordá implícitamente que el usuario decide: el insight es una invitación a mirar, revisable y descartable.
- Breve (máx 3 oraciones). Cálido pero sobrio, sin dramatizar.`

export interface AlignmentNarrativeInput {
  title: string
  category: string
  description?: string
  state: AlignmentState
  linkedPersonNames: string[]
  signals: Array<{ label: string; concern: ConcernLevel }>
}

const STATE_LABEL: Record<AlignmentState, string> = {
  aligned: 'las señales acompañan el objetivo',
  drifting: 'algunas señales se desvían del objetivo',
  needs_attention: 'varias señales no acompañan el objetivo',
  insufficient_data: 'datos insuficientes',
}

/** Arma el mensaje de usuario para Anthropic desde la alineación ya computada. */
export function buildAlignmentInput(input: AlignmentNarrativeInput): string {
  const lines: string[] = [
    `Objetivo declarado: "${input.title}" (dominio: ${input.category}).`,
  ]
  if (input.description) lines.push(`Descripción: ${input.description}`)
  if (input.linkedPersonNames.length > 0) {
    lines.push(`Personas vinculadas: ${input.linkedPersonNames.join(', ')}.`)
  }
  lines.push(`Lectura del sistema: ${STATE_LABEL[input.state]}.`)
  lines.push('', 'Señales observadas:')
  for (const s of input.signals) {
    const tag = s.concern === 2 ? '[se desvía]' : s.concern === 1 ? '[a vigilar]' : '[acompaña]'
    lines.push(`- ${tag} ${s.label}`)
  }
  lines.push('', 'Devolvé el insight reflexivo en el JSON especificado.')
  return lines.join('\n')
}

/**
 * Parsea la respuesta del LLM a un insight string. Tolerante: extrae el
 * primer bloque {...} con "insight"; si no hay JSON válido cae al texto
 * crudo recortado. Devuelve null si no hay nada usable.
 */
export function parseAlignmentNarrative(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1)) as { insight?: unknown }
      if (typeof parsed.insight === 'string' && parsed.insight.trim().length > 0) {
        return parsed.insight.trim()
      }
    } catch {
      // cae al fallback de texto crudo
    }
  }
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}
