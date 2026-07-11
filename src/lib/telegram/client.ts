// SIR V2 — Telegram Bot API: cliente de SALIDA + verificación del webhook.
//
// Env (secrets del server, NUNCA NEXT_PUBLIC_*):
//   - TELEGRAM_BOT_TOKEN       (de @BotFather; da control total del bot)
//   - TELEGRAM_WEBHOOK_SECRET  (string random; Telegram lo reenvía en cada POST
//                               como header X-Telegram-Bot-Api-Secret-Token)
// El token NUNCA se loguea.

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

/**
 * Envía un mensaje de texto a un chat. No lanza: un fallo de envío no debe
 * romper el webhook (Telegram reintenta si no devolvemos 200). Telegram corta
 * los mensajes en ~4096 chars.
 */
export async function sendTelegramMessage(chatId: number, text: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN no configurado' }
  try {
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4096), disable_web_page_preview: true }),
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
