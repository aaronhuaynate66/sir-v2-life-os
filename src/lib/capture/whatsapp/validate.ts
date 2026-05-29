// SIR V2 — Validacion del JSON que devuelve Claude Vision (WhatsApp).
// Type guard manual + sanitizacion. Mismo patron que scale/validate.ts.

import type { WhatsAppCaptureExtracted, WhatsAppMessage, WhatsAppEmotionalStates } from './types'

const HH_MM = /^\d{2}:\d{2}$/

function isStringOrNull(v: unknown): boolean {
  return v === null || typeof v === 'string'
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

function isValidIso8601(v: unknown): v is string {
  if (typeof v !== 'string' || v.length === 0) return false
  const d = new Date(v)
  return !isNaN(d.getTime())
}

function isValidMessage(v: unknown): v is WhatsAppMessage {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  if (typeof o.timestamp !== 'string' || !HH_MM.test(o.timestamp)) return false
  if (o.author !== 'user' && o.author !== 'other') return false
  if (typeof o.content !== 'string') return false
  if (o.hasSticker !== undefined && typeof o.hasSticker !== 'boolean') return false
  if (o.hasEmoji !== undefined && typeof o.hasEmoji !== 'boolean') return false
  return true
}

function isValidEmotionalStates(v: unknown): v is WhatsAppEmotionalStates {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  if (o.otherPerson !== undefined && o.otherPerson !== null && typeof o.otherPerson !== 'string') return false
  if (o.user !== undefined && o.user !== null && typeof o.user !== 'string') return false
  return true
}

export function isValidWhatsAppCaptureExtracted(x: unknown): x is WhatsAppCaptureExtracted {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>

  if (typeof o.personName !== 'string') return false
  if (!isStringOrNull(o.conversationDate)) return false
  if (o.conversationDate !== null && !isValidIso8601(o.conversationDate)) return false

  if (typeof o.summary !== 'string') return false
  if (!isStringArray(o.topics)) return false

  if (!isValidEmotionalStates(o.emotionalStates)) return false

  if (!Array.isArray(o.rawMessages)) return false
  for (const m of o.rawMessages) {
    if (!isValidMessage(m)) return false
  }

  if (o.confidence !== 'high' && o.confidence !== 'medium' && o.confidence !== 'low') return false

  if (o.rawObservations !== undefined && typeof o.rawObservations !== 'string') return false

  if (o.reflectionQuestions !== undefined) {
    if (!isStringArray(o.reflectionQuestions)) return false
  }

  return true
}

/**
 * Limpia el objeto antes de mandarlo al cliente:
 * - trim de summary y rawObservations.
 * - Normaliza emocionalStates con undefined -> default vacio.
 * - Cap a 3 reflectionQuestions.
 */
export function sanitizeExtracted(raw: WhatsAppCaptureExtracted): WhatsAppCaptureExtracted {
  const cleaned: WhatsAppCaptureExtracted = {
    personName: raw.personName.trim(),
    conversationDate: raw.conversationDate,
    summary: raw.summary.trim().slice(0, 320),
    topics: raw.topics.map((t) => t.trim()).filter(Boolean).slice(0, 10),
    emotionalStates: {
      otherPerson: raw.emotionalStates?.otherPerson ?? undefined,
      user: raw.emotionalStates?.user ?? undefined,
    },
    rawMessages: raw.rawMessages,
    confidence: raw.confidence,
    rawObservations:
      typeof raw.rawObservations === 'string'
        ? raw.rawObservations.slice(0, 240).trim() || undefined
        : undefined,
  }
  if (raw.reflectionQuestions && raw.reflectionQuestions.length > 0) {
    cleaned.reflectionQuestions = raw.reflectionQuestions
      .map((q) => q.trim())
      .filter(Boolean)
      .slice(0, 3)
  }
  return cleaned
}
