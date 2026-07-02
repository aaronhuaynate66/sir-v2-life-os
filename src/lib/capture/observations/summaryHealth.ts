// SIR V2 — Detección de summaries pobres en observations.
//
// Cuando el import original de un whatsapp_chat falla la síntesis LLM (rate
// limit, timeout, JSON malformado), el summary queda como fallback template
// "Conversación de WhatsApp con X." o queda el rawObservations "Importado
// del export…". La UI de Bitácora muestra ese texto y no aporta nada. Con
// este helper puro podemos ofrecer un botón "Regenerar resumen" solo cuando
// aplica.

import type { Observation } from './types'

/** ¿Vale la pena regenerar el summary de esta observation? Devuelve true SOLO
 *  cuando (a) el summary parece template/pobre AND (b) hay `rawMessages` con
 *  los que reconstruir. Sin (b) el botón no serviría. */
export function needsResummary(obs: Observation): boolean {
  if (obs.captureType !== 'whatsapp_chat') return false
  const data = (obs.data ?? {}) as Record<string, unknown>
  const raw = data.rawMessages
  if (!Array.isArray(raw) || raw.length === 0) return false // sin base, no ofrecer
  const summary = typeof data.summary === 'string' ? data.summary.trim() : ''
  if (!summary) return true
  if (summary.length < 40) return true
  if (/^Conversaci[oó]n de WhatsApp con /i.test(summary)) return true
  if (/^Importad[oa] del export/i.test(summary)) return true
  return false
}
