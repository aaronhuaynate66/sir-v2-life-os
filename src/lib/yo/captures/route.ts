// SIR V2 — Ruteo de capturas PROPIAS (panel "Mis capturas" en /yo).
//
// El detector universal (POST /api/capture) clasifica cada imagen en un
// CaptureType. En el contexto de /yo —"Mis capturas", data del DUEÑO— ese tipo
// se traduce a un destino SELF concreto:
//
//   - scale            → métricas de báscula (health_metrics)
//   - sleep_panel      → registro de sueño (sleep_records)
//   - heart_rate_panel → FC (health_metrics)
//   - linkedin / instagram → identity_profile (la auto-captura "Que SIR me
//     conozca"). OJO: en este panel asumimos que un perfil es el PROPIO de Aaron
//     (es "Mis capturas"); las capturas de OTRAS personas se hacen en /captura.
//   - cualquier otro (whatsapp_*, manual/voice, unknown) → RECHAZO: no es data
//     biológica/de identidad tuya; se avisa y NO se guarda.
//
// Pura y testeable. La UI sólo decide layout en base a esto.

import type { CaptureType } from '@/lib/capture/observations/types'

/** Destino de una captura dentro del panel "Mis capturas". */
export type SelfCaptureRoute = 'scale' | 'sleep' | 'hr' | 'identity' | 'reject'

export interface SelfRouteDecision {
  route: SelfCaptureRoute
  /** Motivo legible cuando route === 'reject'. */
  reason?: string
}

const REJECT_PERSON: SelfRouteDecision = {
  route: 'reject',
  reason:
    'Esto parece ser de otra persona (un chat o un perfil ajeno). Las capturas de otras personas van por Captura.',
}

const REJECT_UNKNOWN: SelfRouteDecision = {
  route: 'reject',
  reason:
    'No reconocí esto como data tuya (báscula, sueño, FC o tu perfil). No lo guardé.',
}

/**
 * Traduce un CaptureType del detector universal al destino SELF.
 * Determinístico: misma entrada → misma decisión.
 */
export function routeSelfCapture(type: CaptureType): SelfRouteDecision {
  switch (type) {
    case 'scale':
      return { route: 'scale' }
    case 'sleep_panel':
      return { route: 'sleep' }
    case 'heart_rate_panel':
      return { route: 'hr' }
    case 'linkedin':
    case 'instagram':
      // En "Mis capturas" un perfil es el propio → anclas de identidad.
      return { route: 'identity' }
    case 'whatsapp_chat':
    case 'whatsapp_web':
    case 'whatsapp_info':
      return REJECT_PERSON
    case 'manual_note':
    case 'voice_note':
    case 'unknown':
    default:
      return REJECT_UNKNOWN
  }
}
