// SIR V2 — Webhook del BOT DE DEV (@sir_aaron_dev_bot). Q&A de estado técnico.
//
// Separado del webhook relacional (bot y token propios). Le preguntás por el
// estado del repo ("¿pasó CI?", "¿qué PRs hay?", "¿qué se deployó?") y responde
// cruzando la GitHub API + un LLM. Solo TU chat (allowlist TELEGRAM_DEV_CHAT_ID).
//
// INERTE sin config (sin TELEGRAM_DEV_BOT_TOKEN/SECRET → 200 sin nada). Para que
// responda de verdad necesita en el server: TELEGRAM_DEV_BOT_TOKEN,
// TELEGRAM_DEV_WEBHOOK_SECRET, TELEGRAM_DEV_CHAT_ID, GITHUB_TOKEN (repo privado),
// y opcional GITHUB_REPO (default aaronhuaynate66/sir-v2-life-os), ANTHROPIC_API_KEY.

import { NextResponse, type NextRequest, after } from 'next/server'

import { parseTelegramUpdate } from '@/lib/telegram/inbound'
import { isDevBotConfigured, verifyDevSecret, sendDevMessage } from '@/lib/telegram/devClient'
import { fetchGithubStatus } from '@/lib/dev/githubStatus'
import { askDev } from '@/lib/dev/askDev'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const REPO = process.env.GITHUB_REPO || 'aaronhuaynate66/sir-v2-life-os'

export async function POST(req: NextRequest) {
  if (!isDevBotConfigured()) return NextResponse.json({ ok: true, inert: true })
  if (!verifyDevSecret(req.headers.get('x-telegram-bot-api-secret-token'))) {
    return new NextResponse('invalid secret', { status: 401 })
  }

  let payload: unknown
  try { payload = await req.json() } catch { return NextResponse.json({ ok: true }) }
  const msg = parseTelegramUpdate(payload)
  if (!msg) return NextResponse.json({ ok: true })

  const allowedChat = process.env.TELEGRAM_DEV_CHAT_ID?.trim()

  after(async () => {
    // Bootstrap: si aún no fijaste el chat_id, te lo devuelvo.
    if (!allowedChat) {
      await sendDevMessage(msg.chatId, `🛠️ Bot de dev. Tu chat_id es: ${msg.chatId}. Seteá TELEGRAM_DEV_CHAT_ID=${msg.chatId} en Vercel y redesplegá.`)
      return
    }
    if (String(msg.chatId) !== allowedChat) return

    const text = (msg.text || '').trim()
    if (!text) return

    if (text.startsWith('/')) {
      const cmd = text.slice(1).split(/\s+/)[0].toLowerCase()
      if (cmd === 'start' || cmd === 'help') {
        await sendDevMessage(msg.chatId, '🛠️ Soy el bot de dev de SIR. Preguntame por el estado técnico: "¿pasó CI?", "¿qué PRs hay abiertos?", "¿qué se mergeó hoy?", "¿último commit?". Cruzo la GitHub API en vivo.')
        return
      }
    }

    try {
      const status = await fetchGithubStatus(REPO, process.env.GITHUB_TOKEN)
      const answer = await askDev(text, status)
      await sendDevMessage(msg.chatId, answer)
    } catch {
      await sendDevMessage(msg.chatId, 'No pude leer el estado ahora. Reintentá en un momento.')
    }
  })

  return NextResponse.json({ ok: true })
}
