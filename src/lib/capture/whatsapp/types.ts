// SIR V2 — Tipos de captura WhatsApp (post-bascula)
//
// La respuesta de Claude Sonnet 4.5 Vision se materializa como
// WhatsAppCaptureExtracted. Los items que terminan persistidos en
// relationships.history reusan estos tipos (ver RelationshipEvent
// extendido en src/types/index.ts).

/** Un mensaje individual dentro del screenshot. */
export interface WhatsAppMessage {
  /** "HH:mm" en formato 24h, tal cual lo muestra WhatsApp. */
  timestamp: string
  /** 'user' = bubble alineado a la derecha; 'other' = a la izquierda. */
  author: 'user' | 'other'
  /** Texto literal del mensaje. Para stickers: descripcion entre comillas. */
  content: string
  hasSticker?: boolean
  hasEmoji?: boolean
}

/** Estados emocionales inferidos por el modelo (Nivel B). */
export interface WhatsAppEmotionalStates {
  /** Snake_case. Combinable con '+' (ej. "physical_pain + emotional_seeking_support"). */
  otherPerson?: string
  user?: string
}

/** JSON estricto que devuelve POST /api/capture/whatsapp. */
export interface WhatsAppCaptureExtracted {
  /** Nombre tal como aparece en el header del chat (puede tener emojis). */
  personName: string
  /** ISO 8601 inferido del header. null si no es legible. */
  conversationDate: string | null
  /** Narrativo, observacional, max ~280 chars. */
  summary: string
  /** Tags en snake_case (en inglés para consistencia). */
  topics: string[]
  /** Inferencia emocional (Nivel B default). */
  emotionalStates: WhatsAppEmotionalStates
  /** Mensajes extraidos del screenshot en orden cronologico. */
  rawMessages: WhatsAppMessage[]
  /** Presente solo si Nivel C (toggle reflection) activado. Max 3. */
  reflectionQuestions?: string[]
  confidence: 'high' | 'medium' | 'low'
  rawObservations?: string
}

/** Resultado del lookup de contacto contra la tabla `people`. */
export interface PersonMatch {
  /** ID de la persona en `people` (slug-compatible). null si no se encontro. */
  personId: string | null
  /** 'high' = match unico, 'medium' = match ambiguo, 'low' = sin match. */
  confidence: 'high' | 'medium' | 'low'
}

/** Response de error del endpoint. */
export interface WhatsAppCaptureError {
  error: string
  detail?: string
}
