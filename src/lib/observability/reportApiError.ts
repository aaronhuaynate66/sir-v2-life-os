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

import * as Sentry from '@sentry/nextjs'

export function reportApiError(err: unknown, context?: Record<string, unknown>): void {
  Sentry.captureException(err, context ? { extra: context } : undefined)
}
