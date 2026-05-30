// SIR V2 — Sentry (server runtime). Observabilidad pre-beta.
//
// Init INERTE si no hay DSN: sin SENTRY_DSN/NEXT_PUBLIC_SENTRY_DSN, Sentry
// no inicializa y es un no-op total (no cambia el comportamiento de prod).
// El DSN es una clave de ingest PUBLICA por diseño (no es secreto). Se
// provee como variable de entorno en Vercel (ACCION MANUAL).
//
// NO usamos withSentryConfig (subida de source maps via @sentry/cli) para
// no agregar dependencia de build; el SDK captura errores igual en runtime.

import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    enabled: process.env.NODE_ENV === 'production',
  })
}
