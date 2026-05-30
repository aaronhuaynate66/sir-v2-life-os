// SIR V2 — Sentry (browser). Init inerte si no hay DSN.
//
// El DSN del cliente DEBE ser NEXT_PUBLIC_SENTRY_DSN (se hornea en el bundle
// del browser). Es una clave de ingest PUBLICA por diseño (no secreto). Sin
// la env, Sentry no inicializa: no-op total.

import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    enabled: process.env.NODE_ENV === 'production',
  })
}

// Captura de errores de navegación (App Router).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
