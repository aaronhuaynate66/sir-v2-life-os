// SIR V2 — Derivacion de `observed_at` desde el data del extractor.
//
// observed_at es el "cuando ocurrio el contenido" de la captura, distinto
// de captured_at (cuando el usuario hizo el upload). Cada capture_type
// tiene una fuente distinta:
//
//  - whatsapp_chat : data.conversationDate (header del chat).
//  - whatsapp_info : no aplica (es snapshot del perfil) -> fallback now.
//  - instagram     : no aplica (snapshot) -> fallback now.
//  - linkedin      : no aplica (snapshot) -> fallback now.
//  - manual_note   : siempre now.
//  - voice_note    : siempre now (fase futura).
//  - unknown       : siempre now.
//
// Cuando el extractor no devuelve fecha o la devuelve invalida, caemos
// a now() — la observacion se sello AL momento de la captura.

import type { CaptureType } from './types'

/**
 * Computa el ISO 8601 que va a la columna `observed_at` de observations.
 *
 * @param captureType  tipo de la captura
 * @param data         output sanitizado del extractor (puede ser {})
 * @param fallback     ISO 8601 a usar cuando la fecha del extractor no
 *                     es derivable (default: now())
 */
export function deriveObservedAt(
  captureType: CaptureType,
  data: Record<string, unknown>,
  fallback: Date = new Date(),
): string {
  if (captureType === 'whatsapp_chat') {
    const cd = data.conversationDate
    if (typeof cd === 'string' && cd.length > 0) {
      const d = new Date(cd)
      if (!isNaN(d.getTime())) {
        return d.toISOString()
      }
    }
  }
  return fallback.toISOString()
}
