// SIR V2 — Etiquetas legibles para los enums de captura (bitácora / última
// interacción / cualquier UI). Evita mostrar crudos como "WHATSAPP_CHAT" o
// "conf. high" en la ficha. PURO.

import type { CaptureType, Confidence } from '@/lib/capture/observations/types'

const CAPTURE_LABEL: Record<CaptureType, string> = {
  whatsapp_chat: 'WhatsApp',
  whatsapp_web: 'WhatsApp Web',
  whatsapp_info: 'WhatsApp · info',
  instagram: 'Instagram',
  dm_conversation: 'DM / Chat',
  linkedin: 'LinkedIn',
  scale: 'Báscula',
  sleep_panel: 'Sueño',
  heart_rate_panel: 'FC',
  hrv_panel: 'VFC',
  manual_note: 'Nota',
  voice_note: 'Nota de voz',
  unknown: 'Captura',
}

/** Etiqueta humana del tipo de captura (whatsapp_chat → "WhatsApp"). */
export function captureLabel(type: string): string {
  return CAPTURE_LABEL[type as CaptureType] ?? 'Captura'
}

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: 'confianza alta',
  medium: 'confianza media',
  low: 'confianza baja',
}

/** Etiqueta humana de la confianza ("high" → "confianza alta"). null si no hay. */
export function confidenceLabel(conf: string | null | undefined): string | null {
  if (!conf) return null
  return CONFIDENCE_LABEL[conf as Confidence] ?? `confianza ${conf}`
}
