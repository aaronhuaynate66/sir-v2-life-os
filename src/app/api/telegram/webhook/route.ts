// SIR V2 — Webhook de Telegram (canal conversacional, MVP Q&A).
//
// POST → updates del bot. En el MVP: le PREGUNTÁS a SIR por Telegram y responde
// cruzando tu data (mismo cerebro askSir() que la web). Solo TU chat (allowlist).
// La memoria semántica ya es compartida con la web (askSir persiste en
// sir_conversations por user_id → recall C3 cross-canal). El hilo lineal 100%
// unificado (tabla sir_messages) es el paso siguiente.
//
// SEGURIDAD: secret token del webhook (header X-Telegram-Bot-Api-Secret-Token,
// registrado vía setWebhook) + allowlist de chat_id. Un desconocido NO habla con
// tu SIR. INERTE sin config: sin TELEGRAM_BOT_TOKEN/SECRET responde 200 sin nada.
//
// Env (secrets del server): TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET,
// TELEGRAM_ALLOWED_CHAT_ID, TELEGRAM_OWNER_USER_ID, ANTHROPIC_API_KEY,
// SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL.

import { NextResponse, type NextRequest, after } from 'next/server'
import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js'

import { parseTelegramUpdate } from '@/lib/telegram/inbound'
import { isTelegramConfigured, verifyTelegramSecret, sendTelegramMessage, downloadTelegramFile } from '@/lib/telegram/client'
import { transcribeAudio } from '@/lib/ai/transcribeAudio'
import { askSir, AskSirConfigError } from '@/lib/sir/askSir'
import { getSirThread, appendSirThread } from '@/lib/sir/thread'
import { trackServer } from '@/lib/analytics/serverTrack'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** user_id dueño de la data: env explícito o único profile (patrón reader). */
async function resolveOwnerId(admin: SupabaseClient): Promise<string | null> {
  const explicit = process.env.TELEGRAM_OWNER_USER_ID?.trim()
  if (explicit) return explicit
  try {
    const { data } = await admin.from('profiles').select('id').limit(2)
    const rows = (data ?? []) as Array<{ id: string }>
    return rows.length === 1 ? rows[0].id : null
  } catch { return null }
}

export async function POST(req: NextRequest) {
  // Sin config → inerte (200 para que Telegram no reintente durante el setup).
  if (!isTelegramConfigured()) return NextResponse.json({ ok: true, inert: true })

  // Verificación: el header debe coincidir con el secret de setWebhook.
  if (!verifyTelegramSecret(req.headers.get('x-telegram-bot-api-secret-token'))) {
    return new NextResponse('invalid secret', { status: 401 })
  }

  let payload: unknown
  try { payload = await req.json() } catch { return NextResponse.json({ ok: true }) }
  const msg = parseTelegramUpdate(payload)
  if (!msg) return NextResponse.json({ ok: true })

  const allowedChat = process.env.TELEGRAM_ALLOWED_CHAT_ID?.trim()
  const svcUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  // Ack rápido + proceso en background (Telegram reintenta si tardamos).
  after(async () => {
    // Bootstrap: si aún no fijaste tu chat_id, te lo devuelvo para que lo setees.
    if (!allowedChat) {
      await sendTelegramMessage(
        msg.chatId,
        `👋 Soy SIR. Tu chat_id es: ${msg.chatId}\n\nSeteá TELEGRAM_ALLOWED_CHAT_ID=${msg.chatId} en Vercel (Production) y redesplegá para activarme. Hasta entonces no proceso mensajes por seguridad.`,
      )
      return
    }
    // Allowlist: solo tu chat. Otro remitente → silencio.
    if (String(msg.chatId) !== allowedChat) return
    if (!svcUrl || !svcKey) return

    const supabase = createServiceClient(svcUrl, svcKey, { auth: { persistSession: false } })
    const ownerId = await resolveOwnerId(supabase)
    if (!ownerId) {
      await sendTelegramMessage(msg.chatId, 'Falta configurar TELEGRAM_OWNER_USER_ID en el server 🙏.')
      return
    }

    // Resolver el texto de la consulta: directo, o transcribiendo la nota de voz
    // con Whisper (mismo pipeline que WhatsApp).
    let text = msg.text
    if (!text && msg.isVoice && msg.voiceFileId) {
      const media = await downloadTelegramFile(msg.voiceFileId)
      if (!media) {
        await sendTelegramMessage(msg.chatId, 'No pude bajar el audio 😕. Probá de nuevo o escribime.')
        return
      }
      try { text = (await transcribeAudio(media.bytes, media.mimeType)).trim() } catch { text = '' }
      if (!text) {
        await sendTelegramMessage(msg.chatId, 'No le entendí al audio 😅. ¿Me lo repetís o lo escribís?')
        return
      }
    }
    if (!text) return

    // Comandos del bot (/start, /help): bienvenida — no van al cerebro.
    if (text.startsWith('/')) {
      const cmd = text.slice(1).split(/\s+/)[0].toLowerCase()
      if (cmd === 'start' || cmd === 'help') {
        await sendTelegramMessage(
          msg.chatId,
          'Soy SIR 🌿. Preguntame lo que quieras sobre tu gente, tus objetivos o tu día — cruzo tu contexto y te respondo con lo que sé de vos. También te leo notas de voz. Escribime nomás.',
        )
        return
      }
      // Comando desconocido → sigue como pregunta normal (no cortamos).
    }

    try {
      // Hilo unificado (Fase 2): traigo el historial cross-canal para continuidad
      // multi-turno (ve también lo hablado por la web). Fail-open → [].
      const history = await getSirThread(supabase, ownerId, 12)
      const result = await askSir({
        supabase,
        userId: ownerId,
        question: text,
        history,
        // MVP: sin el ida-vuelta de gaps aclaratorios por chat; respuesta directa.
        skipInlineGaps: true,
        // Telegram es un chat: breve, conversacional, sin markdown (el ** se veía crudo).
        chatStyle: true,
      })
      await sendTelegramMessage(msg.chatId, result.answer)
      // Persisto ambos turnos al hilo canónico (compartido con la web).
      await appendSirThread(supabase, ownerId, 'telegram', text, result.answer)
      // GA4 server-side: sin esto el uso por Telegram no aparece en analytics.
      await trackServer('sir_asked', { channel: 'telegram', input_type: msg.isVoice ? 'voice' : 'text' }, ownerId)
    } catch (e) {
      if (e instanceof AskSirConfigError) {
        await sendTelegramMessage(msg.chatId, 'Me falta una API key en el server para pensar 🤔. Avisale a Aaron.')
      } else {
        // eslint-disable-next-line no-console
        console.warn('[telegram] askSir falló:', e instanceof Error ? e.message : e)
        await sendTelegramMessage(msg.chatId, 'Uf, no pude procesarlo ahora. Reintentá en un momento 🙏')
      }
    }
  })

  return NextResponse.json({ ok: true })
}
