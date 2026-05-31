// SIR V2 — Capa narrativa OPCIONAL de la correlación longitudinal (Fase 3c).
//
// La vista de correlación es 100% determinística (correlation.ts). Esta capa
// es opcional, detrás de un botón: toma el resultado YA computado, lo resume
// en un digest de texto plano (determinístico → testeable) y se lo pasa a
// Anthropic para una lectura observacional en prosa.
//
// INVARIANTES (backlog #1 y #5): bienestar sin dramatizar; correlación ≠
// causa; sin diagnóstico/consejo médico; no inventar lo que la data no dice.
// El digest SOLO contiene números que ya calculamos — el LLM no ve los logs
// crudos y se le instruye a no inferir causas.

import type { MetricByPhase } from './correlation'
import type { PersonLogKind } from '@/lib/person-logs/types'

const KIND_LABEL: Record<PersonLogKind, string> = {
  mood: 'Ánimo',
  energy: 'Energía',
  sleep: 'Sueño',
  pain: 'Dolor',
  interaction: 'Interacción',
}

/** Línea de un kind: promedios por fase con datos + delta notable. */
function metricLine(prefix: string, m: MetricByPhase): string {
  const withData = m.buckets.filter((b) => b.average != null)
  const parts = withData.map((b) => `${b.label} ${b.average} (n=${b.count})`)
  let line = `${prefix} — ${KIND_LABEL[m.kind]}: ${parts.join(', ')}`
  if (m.delta) {
    line += `. Delta: ${m.delta.high.label} (${m.delta.high.average}) vs ${m.delta.low.label} (${m.delta.low.average}), diferencia ${m.delta.diff}`
  }
  return line
}

/**
 * Digest determinístico de la correlación (entrada del LLM). Devuelve ''
 * si no hay ningún metric con datos suficientes → el caller NO debe llamar
 * al LLM (no hay nada que narrar).
 */
export function summarizeCorrelation(
  lunar: MetricByPhase[],
  cycle: MetricByPhase[],
): string {
  const lines: string[] = []
  for (const m of lunar) lines.push(metricLine('Fase lunar', m))
  for (const m of cycle) lines.push(metricLine('Fase del ciclo', m))
  return lines.join('\n')
}

export const CORRELATION_NARRATIVE_SYSTEM_PROMPT = `Eres el módulo de lectura longitudinal de SIR, un sistema operativo personal centrado en el bienestar.

Recibís promedios YA calculados de registros (ánimo, energía, sueño, dolor; escala 1-5) agrupados por fase lunar y/o fase del ciclo menstrual, con su delta notable.

Tu tarea: una lectura observacional breve (2-4 oraciones) que describa los patrones que MUESTRAN los números. Nada más.

REGLAS ESTRICTAS:
- Describí correlaciones, NUNCA causas. La correlación no implica causalidad: jamás digas que una fase "provoca", "causa" o "hace que" algo. Usá "tiende a coincidir con", "se observa junto a", "en promedio".
- PROHIBIDO: diagnóstico clínico, consejo médico o psicológico, predicciones, recomendaciones de tratamiento.
- Usá SOLO los números provistos. No inventes fases, valores ni tendencias que no estén en los datos.
- Si la muestra es chica, decílo con humildad ("con pocos registros aún").
- Tono cálido, sobrio, sin dramatizar. Español neutro. Texto plano, sin markdown ni viñetas ni emojis.`

/** Construye el mensaje de usuario para el LLM a partir del digest. */
export function buildNarrativeUserMessage(digest: string): string {
  return `Datos de correlación (promedios por fase, escala 1-5):\n\n${digest}\n\nEscribí la lectura observacional siguiendo las reglas.`
}
