// SIR V2 — Resolución de captura EN CONTEXTO de una persona (lógica pura).
//
// Cuando Aaron sube una captura desde el detalle de una persona, la persona
// está FIJA (no hay matcher). Según el tipo que detecte el detector universal,
// decidimos qué hacer:
//   - 'link'        → tipo con extractor → process + asociar a ESA persona.
//   - 'scale'       → báscula: es self/health (health_metrics, sin persona);
//                     NO se asocia. La UI avisa y manda al flujo de báscula.
//   - 'unsupported' → unknown / sin extractor asociable a persona.
//
// Pura y testeable. El pipeline real (detect → process) lo reusan los client
// fns existentes (detectCaptureType, processCapture); acá sólo decidimos.

import type { CaptureType } from './observations/types'

/** Tipos con extractor que se asocian a una persona (mismo set que /captura). */
export const PERSON_LINKABLE_CAPTURE_TYPES: readonly CaptureType[] = [
  'whatsapp_chat',
  'whatsapp_web',
  'whatsapp_info',
  // DM (IG/Telegram/Messenger): conversación → se asocia como interacción.
  'dm_conversation',
  'instagram',
  'linkedin',
]

export type PersonCapturePlan =
  | { kind: 'link' }
  | { kind: 'scale' }
  | { kind: 'unsupported' }

export function planPersonCapture(type: CaptureType): PersonCapturePlan {
  if (type === 'scale') return { kind: 'scale' }
  if (PERSON_LINKABLE_CAPTURE_TYPES.includes(type)) return { kind: 'link' }
  return { kind: 'unsupported' }
}
