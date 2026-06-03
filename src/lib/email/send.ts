// SIR V2 — Proveedor de email OPCIONAL (server-only).
//
// Detrás de un provider: si hay RESEND_API_KEY en el entorno, manda vía Resend
// (https://resend.com — HTTP simple, sin SDK). Si NO está, es un NO-OP que
// devuelve { skipped: true }: la feature NUNCA se bloquea por falta de email
// (las alertas igual viven in-app). Mismo espíritu que el resto de integraciones
// opcionales del proyecto.
//
// Env (todas server-only, SIN prefijo NEXT_PUBLIC_):
//   - RESEND_API_KEY        : si está, se manda. Si no, se omite.
//   - TRACKER_ALERT_FROM    : remitente (ej. "SIR <alertas@tudominio.com>").
//                             Default 'SIR <onboarding@resend.dev>' (sandbox de
//                             Resend; sólo entrega a tu propio email verificado).
//
// NO usar para push nativo (requiere app nativa — fuera de alcance).

export interface SendEmailArgs {
  to: string
  subject: string
  text: string
  html: string
}

export type SendEmailResult =
  | { sent: true; id?: string }
  | { sent: false; skipped: true; reason: string }
  | { sent: false; skipped: false; error: string }

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const DEFAULT_FROM = 'SIR <onboarding@resend.dev>'

/** ¿Hay un proveedor de email configurado? */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

/**
 * Manda un email si hay proveedor. Fail-open: cualquier ausencia de config
 * devuelve { skipped: true } sin lanzar. Errores del proveedor se devuelven
 * como { error } (no lanzan) para que el caller decida (ej. no marcar como
 * notificado y reintentar en la próxima corrida del cron).
 */
export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { sent: false, skipped: true, reason: 'RESEND_API_KEY no configurada' }
  if (!args.to) return { sent: false, skipped: true, reason: 'sin destinatario' }

  const from = process.env.TRACKER_ALERT_FROM || DEFAULT_FROM

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [args.to],
        subject: args.subject,
        text: args.text,
        html: args.html,
      }),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return { sent: false, skipped: false, error: `Resend ${res.status}: ${detail.slice(0, 200)}` }
    }
    const body = (await res.json().catch(() => ({}))) as { id?: string }
    return { sent: true, id: body.id }
  } catch (e) {
    return { sent: false, skipped: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Base URL absoluta para deep-links en emails. Prioriza APP_BASE_URL (la que
 * setea Aaron, ej. https://sir.app), luego la URL de producción de Vercel, luego
 * la del deployment. '' si nada — el caller debe contemplar deep-link relativo.
 */
export function appBaseUrl(): string {
  const explicit = process.env.APP_BASE_URL
  if (explicit) return explicit.replace(/\/+$/, '')
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (prod) return `https://${prod}`
  const dep = process.env.VERCEL_URL
  if (dep) return `https://${dep}`
  return ''
}
