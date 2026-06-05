// SIR V2 — Dispatcher de extractores de captura.
//
// Dado un capture_type, devuelve:
//   - el system prompt
//   - el validator
//   - el sanitizer
//
// Mantiene UN solo punto de cambio cuando se agreguen tipos nuevos
// (voice_note, manual_note ricos en el futuro).
//
// Soporta: whatsapp_chat, whatsapp_info, instagram, linkedin.
// Tipos sin extractor (manual_note, voice_note, unknown) devuelven null.

import { getSystemPrompt as getWhatsAppChatSystemPrompt } from './whatsapp/prompt'
import {
  isValidWhatsAppCaptureExtracted,
  sanitizeExtracted as sanitizeWhatsAppChat,
} from './whatsapp/validate'

import { WHATSAPP_WEB_SYSTEM_PROMPT } from './whatsapp-web/prompt'
import {
  isValidWhatsAppWebExtracted,
  sanitizeWhatsAppWeb,
} from './whatsapp-web/validate'

import { WHATSAPP_INFO_SYSTEM_PROMPT } from './whatsapp-info/prompt'
import {
  isValidWhatsAppInfoExtracted,
  sanitizeWhatsAppInfo,
} from './whatsapp-info/validate'

import { INSTAGRAM_SYSTEM_PROMPT } from './instagram/prompt'
import {
  isValidInstagramProfileExtracted,
  sanitizeInstagramProfile,
} from './instagram/validate'

import { LINKEDIN_SYSTEM_PROMPT } from './linkedin/prompt'
import {
  isValidLinkedInProfileExtracted,
  sanitizeLinkedInProfile,
} from './linkedin/validate'

import type { CaptureType } from './observations/types'

/** Spec runtime de un extractor. */
export interface ExtractorSpec {
  /** System prompt completo. Para whatsapp_chat acepta el flag reflection. */
  getSystemPrompt: (opts?: { reflection?: boolean }) => string
  /** Type guard que valida la shape devuelta por Vision. */
  isValid: (x: unknown) => boolean
  /** Limpia, trim, clamps el output validado. */
  sanitize: (x: unknown) => Record<string, unknown>
  /** Max tokens recomendado para el output (Vision call). */
  maxTokens: number
}

/** Lookup table central. Tipos sin extractor (manual_note, voice_note,
 *  unknown) devuelven null y el caller debe omitir la llamada Vision. */
export function getExtractorSpec(captureType: CaptureType): ExtractorSpec | null {
  switch (captureType) {
    case 'whatsapp_chat':
      return {
        getSystemPrompt: (opts) => getWhatsAppChatSystemPrompt(Boolean(opts?.reflection)),
        isValid: isValidWhatsAppCaptureExtracted,
        sanitize: (x) =>
          sanitizeWhatsAppChat(x as Parameters<typeof sanitizeWhatsAppChat>[0]) as unknown as Record<
            string,
            unknown
          >,
        maxTokens: 2000,
      }
    case 'whatsapp_web':
      return {
        getSystemPrompt: () => WHATSAPP_WEB_SYSTEM_PROMPT,
        isValid: isValidWhatsAppWebExtracted,
        sanitize: (x) =>
          sanitizeWhatsAppWeb(x as Parameters<typeof sanitizeWhatsAppWeb>[0]) as unknown as Record<
            string,
            unknown
          >,
        maxTokens: 2000,
      }
    case 'whatsapp_info':
      return {
        getSystemPrompt: () => WHATSAPP_INFO_SYSTEM_PROMPT,
        isValid: isValidWhatsAppInfoExtracted,
        sanitize: (x) =>
          sanitizeWhatsAppInfo(x as Parameters<typeof sanitizeWhatsAppInfo>[0]) as unknown as Record<
            string,
            unknown
          >,
        maxTokens: 800,
      }
    case 'instagram':
      return {
        getSystemPrompt: () => INSTAGRAM_SYSTEM_PROMPT,
        isValid: isValidInstagramProfileExtracted,
        sanitize: (x) =>
          sanitizeInstagramProfile(
            x as Parameters<typeof sanitizeInstagramProfile>[0],
          ) as unknown as Record<string, unknown>,
        maxTokens: 1200,
      }
    case 'linkedin':
      return {
        getSystemPrompt: () => LINKEDIN_SYSTEM_PROMPT,
        isValid: isValidLinkedInProfileExtracted,
        sanitize: (x) =>
          sanitizeLinkedInProfile(
            x as Parameters<typeof sanitizeLinkedInProfile>[0],
          ) as unknown as Record<string, unknown>,
        maxTokens: 1800,
      }
    case 'scale':
      // La báscula NO usa el pipeline de observations: tiene su propio
      // endpoint (/api/capture/scale) + persistencia a health_metrics.
      // Devolver null hace que /api/capture/process rechace el tipo (no
      // está en VALID_CAPTURE_TYPES_WITH_EXTRACTOR) y el caller lo rutea
      // al flujo de báscula en su lugar.
      return null
    case 'sleep_panel':
      // El panel de sueño tampoco usa observations: tiene su propio endpoint
      // (/api/capture/sleep) + persistencia a sleep_records. Mismo trato que
      // scale: null aquí, el caller lo rutea al flujo de sueño.
      return null
    case 'manual_note':
    case 'voice_note':
    case 'unknown':
      return null
  }
}
