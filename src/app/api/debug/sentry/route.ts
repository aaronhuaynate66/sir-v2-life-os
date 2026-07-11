// SIR V2 — GET /api/debug/sentry
//
// Verificador de Sentry: dispara un evento de prueba y confirma si el DSN está
// activo. Pensado para usar UNA vez tras cargar NEXT_PUBLIC_SENTRY_DSN en Vercel
// — entrás a la URL logueado y ves si capturó, sin esperar a que ocurra un error
// real. Detrás de sesión (mono-usuario); no expone secretos (el DSN es público
// por diseño y ni siquiera se devuelve, solo un booleano).
//
// Respuesta: { ok, dsnConfigured, captured, environment, eventId?, hint }

import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 10

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    return NextResponse.json({ ok: false, reason: 'auth' }, { status: 401 })
  }

  // Mismo criterio de resolución que sentry.server.config.ts.
  const dsnConfigured = Boolean(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN)
  const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown'

  if (!dsnConfigured) {
    return NextResponse.json({
      ok: true,
      dsnConfigured: false,
      captured: false,
      environment,
      hint: 'Falta el DSN. Cargá NEXT_PUBLIC_SENTRY_DSN en Vercel (scope Production) y redesplegá.',
    })
  }

  // Dispara un evento de prueba. En serverless el proceso puede terminar antes
  // de enviar, así que esperamos el flush explícito (hasta 2s).
  const eventId = Sentry.captureMessage(
    'SIR · verificación de Sentry (GET /api/debug/sentry)',
    'info',
  )
  const captured = await Sentry.flush(2000)

  return NextResponse.json({
    ok: true,
    dsnConfigured: true,
    captured,
    environment,
    eventId: eventId ?? null,
    hint: captured
      ? 'Evento enviado. Buscalo en tu dashboard de Sentry (Issues → level=info).'
      : 'DSN presente pero el flush no confirmó envío. En prod NODE_ENV debe ser "production" (Sentry init tiene enabled: NODE_ENV === "production").',
  })
}
