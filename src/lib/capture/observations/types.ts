// SIR V2 — Tipos de la tabla observations + detector universal.
//
// La tabla observations (migration 0010) es el immutable log de capturas:
// cada upload (WhatsApp chat, WhatsApp info, Instagram, LinkedIn,
// manual_note, voice_note, unknown) genera UN row inmutable que NUNCA
// se sobreescribe (DF1). Reemplazos se marcan via is_obsolete.
//
// Este modulo es la fuente de verdad de tipos del detail page foundation.

/**
 * Tipos validos de captura — debe coincidir EXACTAMENTE con el CHECK
 * constraint de observations.capture_type en migration 0010.
 *
 * Convencion de nuevos tipos: snake_case, descriptivo de la fuente.
 */
export type CaptureType =
  | 'whatsapp_chat'
  | 'whatsapp_web'
  | 'whatsapp_info'
  | 'instagram'
  | 'linkedin'
  | 'manual_note'
  | 'voice_note'
  // 'scale' = captura de báscula inteligente. El detector universal lo
  // reconoce, pero NO se materializa como row de observations: las métricas
  // van a `health_metrics` (capture_type='scale', migration 0005/0007) vía
  // el flujo client-side de /lib/capture/scale. Por eso NO está en el CHECK
  // de observations.capture_type (0010) — es un tipo "self", sin persona.
  | 'scale'
  | 'unknown'

/** Tipos de captura que SON una conversación real (no snapshot de perfil).
 *  Los consumidores de "interacción" (LastInteractionPanel, síntesis, etc.)
 *  filtran por estos. whatsapp_chat = móvil; whatsapp_web = escritorio. */
export const CONVERSATION_CAPTURE_TYPES: readonly CaptureType[] = [
  'whatsapp_chat',
  'whatsapp_web',
]

/**
 * Niveles de confianza reportados por el detector y por los extractores
 * especificos. Uniforme con WhatsAppCaptureExtracted.confidence.
 */
export type Confidence = 'high' | 'medium' | 'low'

/**
 * Resultado del prompt detector (B.1 del PASO 0). Modelo recomendado:
 * claude-sonnet-4-5-20250929 (D3 aprobado).
 */
export interface DetectorResult {
  type: CaptureType
  confidence: Confidence
  /** Pista visual concreta que disparo la decision. Max ~80 chars. */
  reasoning: string
  /** Si el detector ve un nombre en el header del screenshot, lo expone
   *  para que el step de person matching pueda autopopular. */
  suggestedPersonName: string | null
}

/**
 * Shape del row de observations. Mapeo 1:1 con la columna de DB, en
 * camelCase para uso desde el cliente. Conversiones snake_case <->
 * camelCase ocurren en el adapter (proxima sesion).
 */
export interface Observation {
  id: string
  userId: string
  personId: string | null
  captureType: CaptureType
  sourceImagePath: string | null
  storageBucket: string | null
  /** Shape per capture_type. Esquemas TS especificos en B.2-B.4 (Sesion 2). */
  data: Record<string, unknown>
  /** Raw output del detector universal cuando aplica. */
  detectorData: DetectorResult | null
  /** Correcciones manuales del usuario layered on top de data. */
  userEdits: Record<string, unknown> | null
  confidence: Confidence | null
  needsReview: boolean
  /** Cuando ES la info (header date para WhatsApp, post date para Instagram). */
  observedAt: string
  /** Cuando el usuario subio. */
  capturedAt: string
  isObsolete: boolean
  obsoletedAt: string | null
  obsoletedReason: string | null
  createdAt: string
}

/** Bucket de Storage por tipo de captura (paths suben a `{userId}/{type}/...`). */
export function storageBucketFor(captureType: CaptureType): string | null {
  switch (captureType) {
    case 'whatsapp_chat':
    case 'whatsapp_web':
    case 'whatsapp_info':
      return 'whatsapp-captures'
    case 'instagram':
      return 'instagram-captures'
    case 'linkedin':
      return 'linkedin-captures'
    case 'scale':
      // El screenshot de báscula sí se archiva, pero en su propio bucket
      // privado (migration 0005). El upload lo hace persistScaleCapture,
      // no el pipeline de observations.
      return 'scale-captures'
    case 'manual_note':
    case 'voice_note':
    case 'unknown':
      return null
  }
}

/** Response del endpoint POST /api/capture (Sesion 1 — solo detector). */
export interface CaptureDetectResponse {
  detected: DetectorResult
  /** Raw text response from Vision (para debug / fallback). */
  raw: string
}

/** Response de error del endpoint. */
export interface CaptureDetectError {
  error: string
  detail?: string
}
