// SIR V2 — Correo (Graph) · helpers de servidor: config desde env + origin.
import type { NextRequest } from 'next/server'
import type { GraphConfig } from './graph'

/** Origen del sitio para armar el redirect_uri (debe coincidir con Azure). */
export function siteOrigin(req: NextRequest): string {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || req.nextUrl.origin).replace(/\/+$/, '')
}

/** Config de Graph desde env. null si Aaron todavía no registró la app en Azure. */
export function graphConfig(origin: string): GraphConfig | null {
  const clientId = process.env.MS_CLIENT_ID?.trim()
  const clientSecret = process.env.MS_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null
  return {
    clientId,
    clientSecret,
    tenant: process.env.MS_TENANT?.trim() || 'common',
    redirectUri: `${origin}/api/email/callback`,
  }
}
