'use client'
// SIR V2 — Global error boundary (App Router).
//
// Último recurso: atrapa errores que ocurren en el PROPIO root layout (que
// `app/error.tsx` no puede capturar, porque vive debajo del layout). Como
// reemplaza al layout, DEBE renderizar su propio <html>/<body>. No puede
// asumir que globals.css/tailwind estén cargados -> estilos inline para que
// se vea correcto pase lo que pase. Reporta a Sentry (inerte sin DSN).

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0a',
          color: '#f5f5f5',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 8px' }}>
            La aplicación encontró un error
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#a3a3a3', margin: '0 0 20px' }}>
            Ocurrió un error inesperado al cargar SIR. Tus datos están a salvo. Reintentá o
            recargá la página.
          </p>
          {error.digest && (
            <p style={{ fontSize: 11, fontFamily: 'monospace', color: '#666', margin: '0 0 16px' }}>
              ref: {error.digest}
            </p>
          )}
          <button
            onClick={() => reset()}
            style={{
              appearance: 'none',
              border: '1px solid #3f3f46',
              background: '#f5f5f5',
              color: '#0a0a0a',
              borderRadius: 6,
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  )
}
