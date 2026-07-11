// SIR V2 — GA4 Measurement Protocol (tracking SERVER-SIDE).
//
// track() (lib/analytics/track.ts) depende de window.gtag → solo cliente. Los
// canales server-side (webhook de Telegram) no pueden usarlo, así que su uso era
// invisible en GA4. Este helper manda eventos por el Measurement Protocol de GA4.
//
// Env (server): NEXT_PUBLIC_GA4_ID (measurement id, ya usado por el cliente) +
// GA4_API_SECRET (nuevo — se crea en GA4 Admin → Data Streams → Measurement
// Protocol API secrets). FAIL-OPEN: sin cualquiera de los dos, es no-op. NUNCA lanza.

const MP_URL = 'https://www.google-analytics.com/mp/collect'

/**
 * Emite un evento a GA4 desde el servidor. `clientId` debe ser estable por
 * usuario/dispositivo (ej. el user_id) para que GA4 agrupe la actividad.
 */
export async function trackServer(
  eventName: string,
  params: Record<string, string | number> = {},
  clientId = 'sir-server',
): Promise<void> {
  const measurementId = process.env.NEXT_PUBLIC_GA4_ID
  const apiSecret = process.env.GA4_API_SECRET
  if (!measurementId || !apiSecret) return
  try {
    await fetch(
      `${MP_URL}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          events: [{ name: eventName, params: { ...params, engagement_time_msec: 1 } }],
        }),
      },
    )
  } catch {
    /* fail-open: la analítica no debe afectar el flujo */
  }
}
