// SIR V2 — Helper para derivar señales de matching desde el output del
// extractor segun capture_type.
//
// Sesion 2.7 (BUG-002): pre-extraccion solo tenemos el suggestedPersonName
// del detector (ruidoso porque la imagen va comprimida agresiva). Post-
// extraccion tenemos campos autoritativos (fullName, handle, phoneNumber)
// para correr el matcher con muchisima mejor señal.

import type { CaptureType } from './types'
import type { MatcherSignals } from '@/lib/people/matcher'

/**
 * Convierte el output sanitizado de un extractor en señales para el
 * matcher. Cada capture_type aporta lo que su schema soporta:
 *
 *   - linkedin       -> fullName (no hay URL en el extractor today)
 *   - instagram      -> handle + displayName como fallback name
 *   - whatsapp_info  -> phoneNumber + displayName
 *   - whatsapp_chat  -> personName (header del chat)
 *
 * No infiere senales fuera del schema. Si el extractor devolvio null en
 * un campo, no lo incluimos en el resultado.
 */
export function signalsFromExtracted(
  captureType: CaptureType,
  data: Record<string, unknown>,
): MatcherSignals {
  const out: MatcherSignals = {}

  switch (captureType) {
    case 'linkedin': {
      const fullName = readString(data.fullName)
      if (fullName) out.name = fullName
      break
    }
    case 'instagram': {
      const handle = readString(data.handle)
      if (handle) out.handle = handle
      const displayName = readString(data.displayName)
      if (displayName) out.name = displayName
      break
    }
    case 'whatsapp_info': {
      const phone = readString(data.phoneNumber)
      if (phone) out.phone = phone
      const displayName = readString(data.displayName)
      if (displayName) out.name = displayName
      break
    }
    case 'whatsapp_chat': {
      const personName = readString(data.personName)
      if (personName) out.name = personName
      break
    }
    case 'manual_note':
    case 'voice_note':
    case 'unknown':
      break
  }

  return out
}

function readString(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t.length > 0 ? t : undefined
}
