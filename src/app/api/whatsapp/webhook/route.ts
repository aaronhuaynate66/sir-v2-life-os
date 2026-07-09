// SIR V2 — Webhook de WhatsApp Cloud API (canal de captura, MVP inbound).
//
// GET  → verificación del webhook (Meta manda hub.challenge al conectar).
// POST → mensajes entrantes. En el MVP: solo TEXTO, solo del número de Aaron
//        (allowlist), procesado por el MISMO cerebro que /api/relato/ingest
//        (Sonnet → estructura → aplica) y con respuesta de confirmación.
//        Voz/reenvíos/imágenes = follow-up (por ahora se avisan como "pronto").
//
// SEGURIDAD: firma HMAC del body (App Secret) + allowlist del número. La data de
// Aaron es solo suya: un desconocido que escriba al número NO escribe en su SIR.
//
// Env (secrets del server): WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET,
// WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ALLOWED_NUMBER,
// WHATSAPP_OWNER_USER_ID, ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY.
// INERTE hasta que estén cargadas: sin config responde 200 sin hacer nada.

import { NextResponse, type NextRequest, after } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

import { verifyWebhookSignature, parseInboundMessages, normalizePhone, type InboundMessage } from '@/lib/whatsapp/inbound'
import { sendWhatsAppText, isWhatsAppConfigured } from '@/lib/whatsapp/cloud'
import { runRelatoIngest } from '@/lib/relato-ingest/run'
import { buildConfirmationReply } from '@/lib/whatsapp/reply'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ─── GET: verificación del webhook ──────────────────────────────────
export function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const mode = sp.get('hub.mode')
  const token = sp.get('hub.verify_token')
  const challenge = sp.get('hub.challenge')
  const expected = process.env.WHATSAPP_VERIFY_TOKEN
  if (mode === 'subscribe' && expected && token === expected && challenge) {
    // Meta espera el challenge en texto plano.
    return new NextResponse(challenge, { status: 200, headers: { 'content-type': 'text/plain' } })
  }
  return new NextResponse('forbidden', { status: 403 })
}

// ─── POST: mensajes entrantes ───────────────────────────────────────
export async function POST(req: NextRequest) {
  const raw = await req.text()

  const appSecret = process.env.WHATSAPP_APP_SECRET
  // Sin config → inerte: 200 para que Meta no reintente durante el setup.
  if (!appSecret || !isWhatsAppConfigured()) return NextResponse.json({ ok: true, inert: true })

  const sig = req.headers.get('x-hub-signature-256')
  if (!verifyWebhookSignature(raw, sig, appSecret)) {
    return new NextResponse('invalid signature', { status: 401 })
  }

  let payload: unknown
  try { payload = JSON.parse(raw) } catch { return NextResponse.json({ ok: true }) }

  const messages = parseInboundMessages(payload)
  const allowed = normalizePhone(process.env.WHATSAPP_ALLOWED_NUMBER)
  const ownerId = process.env.WHATSAPP_OWNER_USER_ID
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  const svcUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  // Respondemos 200 YA (Meta exige ack rápido) y procesamos en background.
  after(async () => {
    for (const msg of messages) {
      // Allowlist: solo el número de Aaron. Otro remitente → ignorar en silencio.
      if (allowed && msg.from !== allowed) continue
      if (!ownerId || !apiKey || !svcUrl || !svcKey) continue // sin config completa

      if (msg.type !== 'text' || !msg.text) {
        await sendWhatsAppText(msg.from, 'Por ahora capturo solo TEXTO 🙂. Voz y reenvíos de chat vienen pronto.')
        continue
      }

      await handleTextMessage(msg, { ownerId, apiKey, svcUrl, svcKey })
    }
  })

  return NextResponse.json({ ok: true })
}

async function handleTextMessage(
  msg: InboundMessage,
  cfg: { ownerId: string; apiKey: string; svcUrl: string; svcKey: string },
): Promise<void> {
  const supabase = createServiceClient(cfg.svcUrl, cfg.svcKey, { auth: { persistSession: false } })
  try {
    const result = await runRelatoIngest({
      supabase,
      userId: cfg.ownerId,
      text: msg.text!,
      apply: true, // el canal de chat auto-aplica; SIR confirma qué guardó
      apiKey: cfg.apiKey,
    })
    await sendWhatsAppText(msg.from, buildConfirmationReply(result))
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[whatsapp] ingest falló:', e instanceof Error ? e.message : e)
    await sendWhatsAppText(msg.from, 'Uf, no pude procesarlo ahora. Reintentá en un momento 🙏')
  }
}
