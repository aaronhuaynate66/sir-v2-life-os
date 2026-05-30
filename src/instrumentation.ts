// SIR V2 — Next.js instrumentation hook (Sentry server/edge).
//
// register() carga la config de Sentry según el runtime. onRequestError
// captura errores de Server Components / route handlers (hook nativo de
// Next 15). Todo es no-op si no hay DSN configurado.

import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
