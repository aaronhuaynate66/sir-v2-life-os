// SIR V2 — WhatsApp Cloud API: cliente de SALIDA (server-only).
//
// Manda mensajes de texto vía el número de SIR (Cloud API). En el MVP solo
// RESPONDEMOS dentro de la ventana de 24h que abre el usuario → mensajes de
// "Servicio", gratis y sin plantillas (ver docs/SIR-WHATSAPP-SPIKE.md).
//
// Env (secrets del server, NO NEXT_PUBLIC_*):
//   - WHATSAPP_ACCESS_TOKEN     (token del System User / permanente)
//   - WHATSAPP_PHONE_NUMBER_ID  (id del número de SIR en Cloud API)
// Tokens NUNCA se loguean.

const GRAPH_VERSION = 'v21.0'

export function isWhatsAppConfigured(): boolean {
  return !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID)
}

/**
 * Envía un mensaje de texto a `to` (número en formato internacional, solo
 * dígitos). Devuelve { ok } — no lanza: un fallo de envío no debe romper el
 * webhook (Meta reintenta si no devolvemos 200 a tiempo).
 */
export async function sendWhatsAppText(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneId) return { ok: false, error: 'WhatsApp Cloud API no configurado' }
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: body.slice(0, 4000), preview_url: false },
      }),
    })
    if (!res.ok) {
      const t = await res.text()
      // eslint-disable-next-line no-console
      console.warn('[whatsapp] envío falló:', res.status, t.slice(0, 200))
      return { ok: false, error: `${res.status}` }
    }
    return { ok: true }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[whatsapp] envío error:', e instanceof Error ? e.message : e)
    return { ok: false, error: 'network' }
  }
}
