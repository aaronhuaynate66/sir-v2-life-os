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
import { fetchGithubStatus, devSearchTerms, searchCommits, formatCommitSearch } from '@/lib/dev/githubStatus'
import { askDev } from '@/lib/dev/askDev'
import { classifyDevMessage } from '@/lib/dev/classifyDevMessage'
import { createGithubIssue } from '@/lib/dev/githubIssue'
import { logDevInbound, resolveDevInbound } from '@/lib/dev/inboxLog'

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
        await sendDevMessage(msg.chatId, '🛠️ Soy el bot de dev de SIR.\n\n• PREGÚNTAME por el estado técnico: "¿pasó CI?", "¿qué PRs hay?", "¿qué se mergeó hoy?" — cruzo la GitHub API en vivo.\n• DIME un pedido de dev (bug, mejora, cambio): "el botón X no anda", "arregla Y", "estaría bueno Z" — lo anoto como issue en el repo para que se agarre y se arregle.')
        return
      }
    }

    // RED DE SEGURIDAD: se guarda el mensaje ANTES de clasificarlo. Si algo falla
    // más abajo, el pedido no se pierde. Nació de que Aaron preguntara "¿no hay
    // nada que yo haya enviado?" y no se pudiera responder (mig 0172).
    const logId = await logDevInbound(msg.chatId, msg.messageId, text)

    // ¿Es un PEDIDO de dev (bug/feature/cambio) o una PREGUNTA de estado?
    // Request → lo capturamos como issue de GitHub (cola accionable 'dev-inbox').
    // Status → cae al Q&A de siempre. Ante la duda el clasificador elige 'status'.
    const intent = await classifyDevMessage(text)

    if (intent.kind === 'request') {
      const ghToken = process.env.GITHUB_TOKEN
      if (!ghToken) {
        await resolveDevInbound(logId, 'request', null)
        await sendDevMessage(msg.chatId, 'Te leí el pedido pero falta GITHUB_TOKEN en el server para anotarlo como issue 🙏. Lo guardé de todas formas: no se pierde.')
        return
      }
      const body = `${text}\n\n---\n_Reportado por Aaron vía el bot de dev de Telegram (@sir_aaron_dev_bot)._`
      const issue = await createGithubIssue(REPO, ghToken, intent.title, body)
      await resolveDevInbound(logId, 'request', issue?.number ?? null)
      if (issue) {
        await sendDevMessage(msg.chatId, `📌 Anotado como issue #${issue.number}: ${intent.title}\n${issue.url}\n\nQueda en la cola de dev. Lo agarro cuando trabajemos.`)
      } else {
        await sendDevMessage(msg.chatId, 'Te leí el pedido pero no pude crear el issue (¿permisos del GITHUB_TOKEN?). Lo guardé igual, así que no se pierde — lo rescato en la próxima sesión.')
      }
      return
    }

    // 'unknown' = el clasificador NO PUDO juzgar (sin API key, API caída, JSON
    // malo). Antes esto se hacía pasar por 'status' y un pedido se contestaba
    // como pregunta y desaparecía. Ahora se dice, y la fila queda marcada para
    // revisar. Igual seguimos al Q&A: si era una pregunta, se responde.
    await resolveDevInbound(logId, intent.kind === 'unknown' ? 'unknown' : 'status')
    if (intent.kind === 'unknown') {
      await sendDevMessage(msg.chatId, '⚠️ No pude clasificar tu mensaje (el clasificador está caído), así que lo guardé para revisarlo a mano — si era un pedido, no se pierde. Te contesto igual con lo que tengo:')
    }

    try {
      // La ventana de commits recientes NO alcanza para "¿ya hiciste X?": lo que
      // se mergeó ayer ya salió de ella. Se busca en TODO el historial por las
      // palabras de la pregunta, y el bloque le dice al modelo qué se buscó.
      const terms = devSearchTerms(text)
      const [status, hits] = await Promise.all([
        fetchGithubStatus(REPO, process.env.GITHUB_TOKEN),
        searchCommits(REPO, process.env.GITHUB_TOKEN, terms),
      ])
      const answer = await askDev(text, status, formatCommitSearch(terms, hits))
      await sendDevMessage(msg.chatId, answer)
    } catch {
      await sendDevMessage(msg.chatId, 'No pude leer el estado ahora. Reintenta en un momento.')
    }
  })

  return NextResponse.json({ ok: true })
}
