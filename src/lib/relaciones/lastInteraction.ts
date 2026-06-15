// SIR V2 — "Última interacción" para la cabecera de la ficha: fecha + qué pasó.
// Puro y testeable. Elige la señal más reciente y un texto humano corto.

import type { Memory } from '@/types'
import type { Observation } from '@/lib/capture/observations/types'
import type { PersonLog } from '@/lib/person-logs/types'

export interface LastInteractionView {
  /** ISO de la última interacción (lastContact o la observación/log más reciente). */
  dateISO: string | null
  /** Texto corto de qué pasó / qué detectó SIR, o null si no hay nada. */
  text: string | null
}

function clip(s: string, max = 220): string {
  const t = s.trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

export function buildLastInteraction(input: {
  lastContact?: string | null
  memories?: Memory[]
  conversationObservations?: Observation[]
  personLogs?: PersonLog[]
}): LastInteractionView {
  const { lastContact, memories = [], conversationObservations = [], personLogs = [] } = input
  const obs0 = conversationObservations[0]
  const log0 = personLogs.find((l) => l.kind === 'interaction')
  const dateISO = lastContact ?? obs0?.observedAt ?? log0?.loggedAt ?? null

  // Texto: memoria más reciente (con textura) → nota de interacción → null.
  const mem0 = memories[0]
  let text: string | null = null
  if (mem0) {
    const raw = (mem0.content || mem0.title || '').trim()
    if (raw) text = clip(raw)
  }
  if (!text && log0 && typeof log0.note === 'string' && log0.note.trim()) {
    text = clip(log0.note)
  }
  return { dateISO, text }
}
