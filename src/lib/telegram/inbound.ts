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
  /** El mensaje es una nota de voz / audio (para avisar "aún no"). */
  isVoice: boolean
  /** Nombre visible del remitente, best-effort (para logs/bootstrap). */
  fromName: string | null
}

function asRecord(x: unknown): Record<string, unknown> | null {
  return x && typeof x === 'object' ? (x as Record<string, unknown>) : null
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
  const isVoice = !!(message.voice || message.audio)

  const from = asRecord(message.from)
  const fromName = from
    ? [from.first_name, from.last_name].filter((s): s is string => typeof s === 'string' && s.length > 0).join(' ') || null
    : null

  // Solo nos sirve si hay texto o es voz (para el aviso). Otro tipo → ignorar.
  if (!text && !isVoice) return null

  return { chatId, messageId, text, isVoice, fromName }
}
