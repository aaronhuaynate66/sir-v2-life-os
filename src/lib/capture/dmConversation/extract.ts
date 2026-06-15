// SIR V2 — Extractor TOLERANTE para capturas de DM (dm_conversation).
// Reusa el prompt de whatsapp_chat, pero el validador estricto de WhatsApp
// rechazaba (422) cuando Vision devolvía un DM con shape parcial. Acá: isValid
// acepta cualquier objeto y sanitize COERCE a WhatsAppCaptureExtracted con
// defaults seguros → nunca 422, siempre una interacción usable (mismo espíritu
// que el fix tolerante de LinkedIn).

import type { WhatsAppCaptureExtracted, WhatsAppMessage } from '@/lib/capture/whatsapp/types'

const ISO_LIKE = /^\d{4}-\d{2}-\d{2}/

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function coerceMessages(v: unknown): WhatsAppMessage[] {
  if (!Array.isArray(v)) return []
  const out: WhatsAppMessage[] = []
  for (const m of v) {
    if (!m || typeof m !== 'object') continue
    const o = m as Record<string, unknown>
    if (typeof o.content !== 'string' || !o.content.trim()) continue
    out.push({
      timestamp: typeof o.timestamp === 'string' ? o.timestamp.slice(0, 12) : '',
      author: o.author === 'user' ? 'user' : 'other',
      content: o.content.trim().slice(0, 500),
      hasSticker: o.hasSticker === true ? true : undefined,
      hasEmoji: o.hasEmoji === true ? true : undefined,
    })
  }
  return out.slice(0, 60)
}

/** Tolerante: cualquier objeto pasa (sanitize coerce). Evita 422 en DMs. */
export function isValidDmExtracted(x: unknown): x is WhatsAppCaptureExtracted {
  return !!x && typeof x === 'object'
}

export function sanitizeDmExtracted(x: unknown): WhatsAppCaptureExtracted {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
  const date =
    typeof o.conversationDate === 'string' && ISO_LIKE.test(o.conversationDate.trim())
      ? o.conversationDate.trim()
      : null
  const topics = Array.isArray(o.topics)
    ? o.topics.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean).slice(0, 10)
    : []
  const es = (o.emotionalStates && typeof o.emotionalStates === 'object' ? o.emotionalStates : {}) as Record<string, unknown>
  const conf = o.confidence === 'high' || o.confidence === 'medium' || o.confidence === 'low' ? o.confidence : 'low'
  return {
    personName: str(o.personName, 160),
    conversationDate: date,
    summary: str(o.summary, 320),
    topics,
    emotionalStates: {
      otherPerson: typeof es.otherPerson === 'string' ? es.otherPerson : undefined,
      user: typeof es.user === 'string' ? es.user : undefined,
    },
    rawMessages: coerceMessages(o.rawMessages),
    confidence: conf,
    rawObservations:
      typeof o.rawObservations === 'string' ? o.rawObservations.slice(0, 240).trim() || undefined : undefined,
  }
}
