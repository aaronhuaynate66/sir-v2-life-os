// SIR V2 — Validación + sanitización del JSON de WhatsApp WEB.
//
// Reusa la validación/sanitización de whatsapp_chat (la conversación tiene
// la misma shape) y agrega el campo `phoneNumber` (string | null).

import {
  isValidWhatsAppCaptureExtracted,
  sanitizeExtracted,
} from '../whatsapp/validate'
import type { WhatsAppWebExtracted } from './types'

export function isValidWhatsAppWebExtracted(x: unknown): x is WhatsAppWebExtracted {
  if (!isValidWhatsAppCaptureExtracted(x)) return false
  const o = x as unknown as Record<string, unknown>
  // phoneNumber: requerido en el schema, pero tolerante: string | null.
  // (Si el modelo lo omite, lo tratamos como null en sanitize.)
  if (o.phoneNumber !== undefined && o.phoneNumber !== null && typeof o.phoneNumber !== 'string') {
    return false
  }
  return true
}

export function sanitizeWhatsAppWeb(raw: WhatsAppWebExtracted): WhatsAppWebExtracted {
  const base = sanitizeExtracted(raw)
  const phone =
    typeof raw.phoneNumber === 'string' && raw.phoneNumber.trim().length > 0
      ? raw.phoneNumber.trim().slice(0, 40)
      : null
  return { ...base, phoneNumber: phone }
}
