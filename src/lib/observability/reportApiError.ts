// SIR V2 — Reporte de errores de API a Sentry (Auditoría técnica — quick-win).
//
// Pensado para el catch MÁS EXTERNO de cada route handler: el lugar donde cae
// un error INESPERADO (excepción no prevista) justo antes de devolver un 500.
// Los errores ya manejados con errorJson(4xx) NO deben pasar por acá.
//
// Es un no-op TOTAL si no hay SENTRY_DSN configurado (Sentry no inicializa →
// captureException no envía nada). Por eso se puede dejar cableado en prod sin
// efecto observable: cuando Aaron cargue el DSN en Vercel, estos 500 empiezan
// a fluir solos, sin tocar más código.
//
// Nota: el hook nativo onRequestError (instrumentation.ts) solo captura errores
// que se PROPAGAN; como los routes atrapan todo en su catch y responden 500,
// esos nunca llegarían a Sentry sin este reporte explícito.
//
// FILTRO DE RUIDO: los fallos de CUOTA/BILLING de un proveedor (OpenAI 429
// "exceeded your current quota", etc.) NO son bugs del código — son un estado de
// facturación, y las llamadas que los sufren ya degradan fail-open (ej. la
// búsqueda semántica sigue sin recall). Paginar por ellos es ruido. Los dejamos
// como warning en el log del server, sin captureException (sin email/alerta).

import * as Sentry from '@sentry/nextjs'

/** ¿El error es un tope de cuota / problema de facturación de un proveedor?
 *  (No es un bug: es billing + ya hay fail-open.) PURO. */
export function isBillingQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { name?: unknown; status?: unknown; message?: unknown }
  const status = typeof e.status === 'number' ? e.status : undefined
  const msg = typeof e.message === 'string' ? e.message.toLowerCase() : ''
  // Embeddings de OpenAI: 429 = cuota agotada.
  if (e.name === 'EmbeddingError' && status === 429) return true
  // Cualquier proveedor: mensaje inequívoco de cuota/billing.
  if (/exceeded your current quota|check your (plan|billing)|insufficient.*quota|billing details|quota exceeded/.test(msg)) {
    return true
  }
  return false
}

export function reportApiError(err: unknown, context?: Record<string, unknown>): void {
  if (isBillingQuotaError(err)) {
    // Degradación esperada de billing → warning en el log, sin alertar.
    // eslint-disable-next-line no-console
    console.warn('[billing-quota] proveedor sin cuota (fail-open, no es bug):', err instanceof Error ? err.message : err)
    return
  }
  Sentry.captureException(err, context ? { extra: context } : undefined)
}
