// SIR V2 — Telegram Bot API: cliente de SALIDA + verificación del webhook.
//
// Env (secrets del server, NUNCA NEXT_PUBLIC_*):
//   - TELEGRAM_BOT_TOKEN       (de @BotFather; da control total del bot)
//   - TELEGRAM_WEBHOOK_SECRET  (string random; Telegram lo reenvía en cada POST
//                               como header X-Telegram-Bot-Api-Secret-Token)
// El token NUNCA se loguea.

import { stripMarkdown } from './plainText'

const API = 'https://api.telegram.org'

export function isTelegramConfigured(): boolean {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET)
}

/** Comparación constant-time (evita timing-oracle sobre el secret). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Verifica que el POST viene de Telegram: el header debe coincidir con el secret
 * que registramos vía setWebhook. Sin secret configurado → false (fail-closed).
 */
export function verifyTelegramSecret(header: string | null): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!expected || !header) return false
  return safeEqual(header, expected)
}

/**
 * Descarga una nota de voz/audio por su file_id. Telegram lo entrega en 2 pasos:
 * getFile → { file_path }, y luego GET a /file/bot<token>/<file_path>. Devuelve
 * los bytes + mimeType (el voice de Telegram es ogg/opus), o null. NUNCA lanza.
 */
export async function downloadTelegramFile(fileId: string): Promise<{ bytes: ArrayBuffer; mimeType: string } | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token || !fileId) return null
  try {
    const metaRes = await fetch(`${API}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`)
    if (!metaRes.ok) return null
    const meta = (await metaRes.json()) as { ok?: boolean; result?: { file_path?: string } }
    const path = meta?.result?.file_path
    if (!path) return null
    const binRes = await fetch(`${API}/file/bot${token}/${path}`)
    if (!binRes.ok) return null
    const bytes = await binRes.arrayBuffer()
    const mimeType = (binRes.headers.get('content-type') || 'audio/ogg').split(';')[0].trim()
    return { bytes, mimeType }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[telegram] descarga de audio falló:', e instanceof Error ? e.message : e)
    return null
  }
}

/** Un botón inline (subconjunto de la Telegram Bot API que usamos). */
export interface InlineButton { text: string; callbackData: string }

/**
 * Envía un mensaje de texto a un chat. No lanza: un fallo de envío no debe
 * romper el webhook (Telegram reintenta si no devolvemos 200). Telegram corta
 * los mensajes en ~4096 chars. Opcionalmente adjunta UNA fila de botones inline
 * (para la confirmación de captura de notas: ✅ Guardar / ✗ Descartar).
 */
export async function sendTelegramMessage(
  chatId: number,
  text: string,
  buttons?: InlineButton[],
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN no configurado' }
  try {
    const body: Record<string, unknown> = {
      chat_id: chatId,
      // Sin parse_mode → limpiamos markdown para que no salgan **, `, ## crudos.
      text: stripMarkdown(text).slice(0, 4096),
      disable_web_page_preview: true,
    }
    if (buttons && buttons.length > 0) {
      body.reply_markup = {
        inline_keyboard: [buttons.map((b) => ({ text: b.text, callback_data: b.callbackData }))],
      }
    }
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const t = await res.text()
      // eslint-disable-next-line no-console
      console.warn('[telegram] envío falló:', res.status, t.slice(0, 200))
      return { ok: false, error: `${res.status}` }
    }
    return { ok: true }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[telegram] envío error:', e instanceof Error ? e.message : e)
    return { ok: false, error: 'network' }
  }
}

/**
 * Envía un mensaje con teclado inline MULTI-FILA (una fila por sub-array). Para
 * el check-in de hábitos: un botón por hábito, uno por fila (legible en móvil).
 * rows=[] → sin teclado. No lanza. Devuelve el message_id para poder editarlo.
 */
export async function sendTelegramKeyboard(
  chatId: number, text: string, rows: InlineButton[][],
): Promise<{ ok: boolean; messageId?: number }> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return { ok: false }
  try {
    const inline_keyboard = rows.map((r) => r.map((b) => ({ text: b.text, callback_data: b.callbackData })))
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId, text: stripMarkdown(text).slice(0, 4096),
        disable_web_page_preview: true,
        ...(rows.length ? { reply_markup: { inline_keyboard } } : {}),
      }),
    })
    if (!res.ok) return { ok: false }
    const j = (await res.json()) as { result?: { message_id?: number } }
    return { ok: true, messageId: j.result?.message_id }
  } catch { return { ok: false } }
}

/** Edita un mensaje reemplazando texto Y teclado (multi-fila). rows=[] → sin
 *  teclado. Para actualizar el check-in tras marcar un hábito. No lanza. */
export async function editTelegramKeyboard(
  chatId: number, messageId: number, text: string, rows: InlineButton[][],
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return
  try {
    const inline_keyboard = rows.map((r) => r.map((b) => ({ text: b.text, callback_data: b.callbackData })))
    await fetch(`${API}/bot${token}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: stripMarkdown(text).slice(0, 4096), reply_markup: { inline_keyboard } }),
    })
  } catch { /* no-op */ }
}

/**
 * Responde un callback_query (tap de botón inline). Telegram lo exige para que
 * el spinner del botón pare; opcionalmente muestra un toast. No lanza.
 */
export async function answerCallbackQuery(callbackId: string, text?: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return
  try {
    await fetch(`${API}/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackId, ...(text ? { text: text.slice(0, 200) } : {}) }),
    })
  } catch { /* no-op */ }
}

/**
 * Reemplaza el texto de un mensaje ya enviado y le quita los botones (se usa tras
 * confirmar/descartar, para dejar el resultado y que no se pueda re-tapear). No lanza.
 */
export async function editTelegramMessageText(chatId: number, messageId: number, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return
  try {
    await fetch(`${API}/bot${token}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: text.slice(0, 4096), reply_markup: { inline_keyboard: [] } }),
    })
  } catch { /* no-op */ }
}
