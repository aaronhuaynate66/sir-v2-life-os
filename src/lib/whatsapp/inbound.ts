// SIR V2 — WhatsApp Cloud API: verificación de firma + parseo del webhook. PURO.
//
// Meta manda los mensajes entrantes a nuestro webhook. Dos cosas de seguridad:
//   1. Firma HMAC-SHA256 del body con el App Secret (header X-Hub-Signature-256)
//      → garantiza que el POST viene de Meta, no de un impostor.
//   2. Allowlist: solo procesamos mensajes del número de Aaron (su data es solo
//      suya; un desconocido que escriba al número NO debe escribir en su SIR).
//
// El parseo baja el payload (bastante anidado) a lo que nos importa: quién
// escribió, qué tipo, y el texto. Voz/imágenes/reenvíos = follow-up.

import { createHmac, timingSafeEqual } from 'crypto'

/**
 * Verifica la firma del webhook de Meta. `signatureHeader` = 'sha256=<hex>'.
 * Compara en tiempo constante. Devuelve false ante cualquier formato inesperado.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader || !appSecret) return false
  const m = /^sha256=([0-9a-f]+)$/i.exec(signatureHeader.trim())
  if (!m) return false
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(m[1], 'hex')
  if (a.length !== b.length || a.length === 0) return false
  return timingSafeEqual(a, b)
}

/** Normaliza un número a solo dígitos (para comparar allowlist sin '+', espacios, etc.). */
export function normalizePhone(n: string | null | undefined): string {
  return (n ?? '').replace(/\D/g, '')
}

export interface InboundMessage {
  /** Número del remitente (solo dígitos). */
  from: string
  /** Id del mensaje de WhatsApp (para dedupe / no re-procesar). */
  messageId: string
  /** 'text' | 'audio' | 'image' | 'document' | 'other'. */
  type: string
  /** Texto del mensaje (solo si type='text'). */
  text?: string
  /** Id del media a descargar (audio/voz). Solo si type='audio'. */
  mediaId?: string
  /** MIME del media (ej. 'audio/ogg; codecs=opus'). */
  mimeType?: string
  /** Nombre del perfil de WhatsApp del remitente (si viene). */
  profileName?: string
}

interface WaValue {
  messages?: Array<{
    from?: string
    id?: string
    type?: string
    text?: { body?: string }
    audio?: { id?: string; mime_type?: string; voice?: boolean }
  }>
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>
}

/**
 * Extrae los mensajes entrantes del payload del webhook. Ignora los eventos de
 * estado (delivered/read) que Meta también manda. Devuelve [] si no hay mensajes.
 */
export function parseInboundMessages(payload: unknown): InboundMessage[] {
  const out: InboundMessage[] = []
  const p = payload as { entry?: Array<{ changes?: Array<{ value?: WaValue }> }> }
  for (const entry of p?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      const profileName = value?.contacts?.[0]?.profile?.name
      for (const msg of value?.messages ?? []) {
        out.push({
          from: normalizePhone(msg.from),
          messageId: msg.id ?? '',
          type: msg.type ?? 'other',
          text: msg.type === 'text' ? msg.text?.body?.trim() : undefined,
          mediaId: msg.type === 'audio' ? msg.audio?.id : undefined,
          mimeType: msg.type === 'audio' ? msg.audio?.mime_type : undefined,
          profileName,
        })
      }
    }
  }
  return out
}
