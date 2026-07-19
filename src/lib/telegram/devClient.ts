// SIR V2 — Cliente de SALIDA + verificación para el BOT DE DEV (@sir_aaron_dev_bot).
//
// Bot SEPARADO del relacional (token propio TELEGRAM_DEV_BOT_TOKEN). El bot de dev
// pasa de solo-notificar (GitHub Action) a RESPONDER estado técnico. Aislado del
// cliente relacional a propósito (Aaron pidió no mezclar canales). El token nunca
// se loguea.

import { stripMarkdown } from './plainText'

const API = 'https://api.telegram.org'

export function isDevBotConfigured(): boolean {
  return !!(process.env.TELEGRAM_DEV_BOT_TOKEN && process.env.TELEGRAM_DEV_WEBHOOK_SECRET)
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Verifica que el POST viene de Telegram (header vs TELEGRAM_DEV_WEBHOOK_SECRET). */
export function verifyDevSecret(header: string | null): boolean {
  const expected = process.env.TELEGRAM_DEV_WEBHOOK_SECRET
  if (!expected || !header) return false
  return safeEqual(header, expected)
}

/** Envía por el bot de dev. No lanza. Telegram corta a ~4096 chars. */
export async function sendDevMessage(chatId: number, text: string): Promise<{ ok: boolean }> {
  const token = process.env.TELEGRAM_DEV_BOT_TOKEN
  if (!token) return { ok: false }
  try {
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Telegram no renderiza markdown sin parse_mode → los ** salían crudos y se
      // veía roto. Lo limpiamos a texto plano (el modelo igual los mete a veces).
      body: JSON.stringify({ chat_id: chatId, text: stripMarkdown(text).slice(0, 4096), disable_web_page_preview: true }),
    })
    return { ok: res.ok }
  } catch {
    return { ok: false }
  }
}
