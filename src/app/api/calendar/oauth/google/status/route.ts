// SIR V2 — GET /api/calendar/oauth/google/status
//
// La UI usa este endpoint para decidir si mostrar el botón "Conectar con
// Google". Devuelve simplemente si el server tiene GOOGLE_OAUTH_CLIENT_ID
// y SECRET seteados (sin decir cuáles).

import { NextResponse } from 'next/server'
import { isGoogleOAuthConfigured } from '@/lib/calendar/oauth/google'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({ configured: isGoogleOAuthConfigured() })
}
