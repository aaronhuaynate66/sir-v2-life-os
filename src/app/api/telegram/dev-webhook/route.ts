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
import { fetchLatestSession, formatSessionStatus } from '@/lib/dev/sessionStatus'
import { askDev } from '@/lib/dev/askDev'
import { classifyDevMessage } from '@/lib/dev/classifyDevMessage'
import { createGithubIssue } from '@/lib/dev/githubIssue'

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
      await sendDevMessage(msg.chatId, `🛠️ Bot de dev. Tu chat_id es: ${msg.chatId}. Setea TELEGRAM_DEV_CHAT_ID=${msg.chatId} en Vercel y vuelve a desplegar.`)
      return
    }
    if (String(msg.chatId) !== allowedChat) return

    const text = (msg.text || '').trim()
    if (!text) return

    if (text.startsWith('/')) {
      const cmd = text.slice(1).split(/\s+/)[0].toLowerCase()
      if (cmd === 'start' || cmd === 'help') {
        await sendDevMessage(msg.chatId, '🛠️ Soy el bot de dev de SIR.\n\n• PREGÚNTAME EN QUÉ ANDA CLAUDE AHORITA: "¿en qué andas?", "¿qué avanzaste?", "¿qué estás haciendo?" — leo la sesión EN VIVO de Claude Code en la laptop (lo que hace antes de commitear).\n• PREGÚNTAME por el estado técnico: "¿pasó CI?", "¿qué PRs hay?", "¿qué se mergeó hoy?" — cruzo la GitHub API en vivo.\n• DIME un pedido de dev (bug, mejora, cambio): "el botón X no anda", "arregla Y", "estaría bueno Z" — lo anoto como issue en el repo para que se agarre y se arregle.')
        return
      }
    }

    // ¿Es un PEDIDO de dev (bug/feature/cambio) o una PREGUNTA de estado?
    // Request → lo capturamos como issue de GitHub (cola accionable 'dev-inbox').
    // Status → cae al Q&A de siempre. Ante la duda el clasificador elige 'status'.
    const intent = await classifyDevMessage(text)
    if (intent.kind === 'request') {
      const ghToken = process.env.GITHUB_TOKEN
      if (!ghToken) {
        await sendDevMessage(msg.chatId, 'Te leí el pedido pero falta GITHUB_TOKEN en el server para anotarlo como issue 🙏.')
        return
      }
      const body = `${text}\n\n---\n_Reportado por Aaron vía el bot de dev de Telegram (@sir_aaron_dev_bot)._`
      const issue = await createGithubIssue(REPO, ghToken, intent.title, body)
      if (issue) {
        await sendDevMessage(msg.chatId, `📌 Anotado como issue #${issue.number}: ${intent.title}\n${issue.url}\n\nQueda en la cola de dev (label dev-inbox). Lo agarro cuando trabajemos.`)
      } else {
        await sendDevMessage(msg.chatId, 'Te leí el pedido pero no pude crear el issue (¿permisos del GITHUB_TOKEN para issues?). Reintenta o avísame por aquí.')
      }
      return
    }

    try {
      const [status, session] = await Promise.all([
        fetchGithubStatus(REPO, process.env.GITHUB_TOKEN),
        fetchLatestSession(),
      ])
      const answer = await askDev(text, status, formatSessionStatus(session))
      await sendDevMessage(msg.chatId, answer)
    } catch {
      await sendDevMessage(msg.chatId, 'No pude leer el estado ahora. Reintenta en un momento.')
    }
  })

  return NextResponse.json({ ok: true })
}
