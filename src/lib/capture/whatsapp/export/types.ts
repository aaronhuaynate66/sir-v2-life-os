// SIR V2 — Tipos del flujo "subir export de WhatsApp" (.txt / .zip).
//
// A diferencia de la captura WhatsApp por SCREENSHOT (Vision, ver
// ../types.ts), acá la fuente es el ARCHIVO exportable del chat: WhatsApp
// genera un `_chat.txt` (texto FIEL, no OCR) y, si se incluyó media, un
// `.zip` con `_chat.txt` + archivos de media. Las conversaciones reales
// superan el tope de 20k del path de texto, así que el flujo parte la
// conversación en BLOQUES y deriva una interpretación por bloque que luego
// se consolida en UNA sola observación whatsapp_chat (misma que alimenta
// "Lo personal", reciprocidad, fechas, señales y memorias).
//
// Convención de capas:
//   - parse.ts        : texto del export → ExportMessage[] (PURO, browser+server)
//   - chunk.ts        : ExportMessage[] → ConversationChunk[] (PURO)
//   - interpret.ts    : prompt + validación de ChunkInterpretation (PURO)
//   - consolidate.ts  : ChunkInterpretation[] → ConsolidatedExport (PURO)
//   - zip.ts          : .zip → _chat.txt (SOLO server, node:zlib)

import type { Confidence } from '../../observations/types'

/** Un mensaje individual del export, ya normalizado. */
export interface ExportMessage {
  /** Fecha+hora del mensaje en ISO 8601 si se pudo resolver; null si no. */
  iso: string | null
  /** "HH:mm" (24h) del mensaje — siempre presente cuando la línea parseó. */
  time: string
  /** Nombre del autor tal cual aparece en el export (sin mapear a user/other). */
  author: string
  /** Texto del mensaje. Las líneas de media se reemplazan por "[media]". */
  content: string
  /** true si el contenido original era un adjunto/omitido de media. */
  isMedia: boolean
}

/** Una línea de "sistema" del export (cifrado E2E, cambios de grupo, etc.).
 *  No se interpretan pero se cuentan para el meta. */
export interface ExportSystemLine {
  iso: string | null
  text: string
}

/** Resultado de parsear el texto completo del export. */
export interface ParsedExport {
  messages: ExportMessage[]
  /** Cantidad de líneas de sistema descartadas (cifrado, llamadas, etc.). */
  systemLineCount: number
  /** Cantidad de mensajes que eran media (subconjunto de messages). */
  mediaCount: number
  /** Formato detectado del export (para UI/debug). */
  format: 'ios' | 'android' | 'unknown'
  /** Participantes únicos detectados (nombres de autor). */
  participants: string[]
  /** ISO del primer y último mensaje con fecha resoluble. null si ninguno. */
  firstISO: string | null
  lastISO: string | null
}

/** Un bloque de conversación listo para interpretar (texto renderizado). */
export interface ConversationChunk {
  index: number
  /** Texto del bloque (líneas "HH:mm — Autor: contenido"). */
  text: string
  /** Cantidad de mensajes incluidos en el bloque. */
  messageCount: number
  /** Rango de fechas del bloque (ISO) si se pudo resolver. */
  firstISO: string | null
  lastISO: string | null
}

/** Una fecha/evento mencionado en la charla (para Fechas importantes / agenda). */
export interface ExtractedDate {
  /** Etiqueta corta de la fecha/evento (ej. "Cumpleaños de Ana"). */
  label: string
  /** ISO 8601 (date-only o con hora) si se pudo resolver; null si no. */
  dateISO: string | null
  /** Texto literal de la charla del que salió (para que el usuario verifique). */
  rawText: string
  /** Si parece repetirse cada año (cumpleaños, aniversario). */
  recurring: boolean
  /** De QUIÉN es el evento: 'contact' (del contacto de la ficha), 'self' (del
   *  usuario, ej. "tu cumpleaños"), 'tercero' (otra persona, ej. "cumple de tata").
   *  Solo las de 'contact' (o ausente=legacy) se adjuntan a la ficha. */
  subject?: 'contact' | 'self' | 'tercero'
}

/** Interpretación de UN bloque devuelta por el modelo. */
export interface ChunkInterpretation {
  /** Resumen observacional del bloque, en español. */
  summary: string
  /** Tags en snake_case (inglés) del bloque. */
  topics: string[]
  /** Estado emocional inferido del usuario en el bloque (snake_case) o null. */
  emotionalUser: string | null
  /** Estado emocional inferido de la otra persona o null. */
  emotionalOther: string | null
  /** Calidad/tono del intercambio en el bloque (1=tenso … 5=pleno). */
  toneScore: number
  /** Fechas/eventos mencionados explícitamente en el bloque. */
  dates: ExtractedDate[]
  /** Eventos/planes notables mencionados (texto corto, sin fecha). */
  events: string[]
  /** Hechos notables sobre la OTRA persona (material de memoria). */
  facts: string[]
}

/** Resultado de consolidar todos los bloques en una sola lectura. */
export interface ConsolidatedExport {
  summary: string
  topics: string[]
  emotionalUser: string | null
  emotionalOther: string | null
  /** Calidad de interacción consolidada (1-5), PROMEDIO de toda la charla —
   *  para la narrativa histórica. */
  interactionQuality: number
  /** Tono de la VENTANA RECIENTE (1-5): mínimo de los últimos bloques. Es el
   *  "¿cómo estamos AHORA?" — una pelea reciente lo hunde aunque atrás haya
   *  años buenos. Alimenta el score (Reciprocidad), no el promedio histórico. */
  recentTone: number
  /** Tono emocional normalizado [-1, 1] derivado de la calidad. */
  emotionalTone: number
  dates: ExtractedDate[]
  events: string[]
  facts: string[]
  /** Resúmenes por bloque (material rico para síntesis/memorias). */
  blockSummaries: string[]
  confidence: Confidence
}
