// SIR V2 — Telegram: parseo de updates entrantes (PURO, testeable).
//
// El webhook de Telegram recibe un "Update". Nos interesa `message` con texto
// (y detectar voz para avisar que aún no la procesamos). Parseo defensivo:
// devuelve null si no es un mensaje que sepamos manejar. No lanza.
// Ref: https://core.telegram.org/bots/api#update

export interface TelegramInbound {
  chatId: number
  messageId: number
  /** Texto del mensaje (vacío si es voz u otro tipo). */
  text: string
  /** El mensaje es una nota de voz / audio. */
  isVoice: boolean
  /** file_id del audio/voz para descargarlo (null si no es voz). */
  voiceFileId: string | null
  /** file_id de una FOTO (screenshot que Aaron comparte, ej. una story de IG),
   *  o null. La más grande del array photo, o un document con mime image/*. */
  photoFileId: string | null
  /** Texto que acompaña a la foto (message.caption), si hay. */
  caption: string
  /** Nombre visible del remitente, best-effort (para logs/bootstrap). */
  fromName: string | null
}

/** Tap de un botón inline (callback_query). Ver captura de notas por chat. */
export interface TelegramCallback {
  /** id del callback_query (para answerCallbackQuery). */
  callbackId: string
  chatId: number
  /** id del mensaje que tiene los botones (para editarlo tras resolver). */
  messageId: number
  /** callback_data del botón tapeado. */
  data: string
  /** Texto del mensaje que tenía los botones. Sirve para editarlo CONSERVANDO lo
   *  que decía y anexando el desenlace (el brief de la mañana lo usa). */
  messageText?: string
}

function asRecord(x: unknown): Record<string, unknown> | null {
  return x && typeof x === 'object' ? (x as Record<string, unknown>) : null
}

/**
 * Parsea un update de tipo callback_query (tap de botón inline). null si el
 * payload no es un callback que sepamos manejar. No lanza.
 * Ref: https://core.telegram.org/bots/api#callbackquery
 */
export function parseTelegramCallback(payload: unknown): TelegramCallback | null {
  const root = asRecord(payload)
  if (!root) return null
  const cq = asRecord(root.callback_query)
  if (!cq) return null
  const callbackId = typeof cq.id === 'string' ? cq.id : null
  const data = typeof cq.data === 'string' ? cq.data : null
  const message = asRecord(cq.message)
  const chat = message ? asRecord(message.chat) : null
  const chatId = chat && typeof chat.id === 'number' ? chat.id : null
  const messageId = message && typeof message.message_id === 'number' ? message.message_id : 0
  if (!callbackId || !data || chatId === null) return null
  const messageText = message && typeof message.text === 'string' ? message.text : undefined
  return { callbackId, chatId, messageId, data, ...(messageText ? { messageText } : {}) }
}

export function parseTelegramUpdate(payload: unknown): TelegramInbound | null {
  const root = asRecord(payload)
  if (!root) return null
  // Aceptamos message y edited_message (si edita, lo tratamos como nuevo).
  const message = asRecord(root.message) ?? asRecord(root.edited_message)
  if (!message) return null

  const chat = asRecord(message.chat)
  const chatId = chat && typeof chat.id === 'number' ? chat.id : null
  if (chatId === null) return null

  const messageId = typeof message.message_id === 'number' ? message.message_id : 0
  const text = typeof message.text === 'string' ? message.text.trim() : ''
  const voice = asRecord(message.voice) ?? asRecord(message.audio)
  const voiceFileId = voice && typeof voice.file_id === 'string' ? voice.file_id : null
  const isVoice = !!voiceFileId

  // Foto: array `photo` (varios tamaños; el último es el más grande) o un
  // document con mime image/* (screenshot mandado como archivo).
  let photoFileId: string | null = null
  const photos = Array.isArray(message.photo) ? (message.photo as unknown[]) : []
  if (photos.length > 0) {
    const largest = asRecord(photos[photos.length - 1])
    if (largest && typeof largest.file_id === 'string') photoFileId = largest.file_id
  }
  if (!photoFileId) {
    const doc = asRecord(message.document)
    const mime = doc && typeof doc.mime_type === 'string' ? doc.mime_type : ''
    if (doc && typeof doc.file_id === 'string' && /^image\//.test(mime)) photoFileId = doc.file_id
  }
  const caption = typeof message.caption === 'string' ? message.caption.trim() : ''

  const from = asRecord(message.from)
  const fromName = from
    ? [from.first_name, from.last_name].filter((s): s is string => typeof s === 'string' && s.length > 0).join(' ') || null
    : null

  // Nos sirve si hay texto, voz o foto. Otro tipo → ignorar.
  if (!text && !isVoice && !photoFileId) return null

  return { chatId, messageId, text, isVoice, voiceFileId, photoFileId, caption, fromName }
}
