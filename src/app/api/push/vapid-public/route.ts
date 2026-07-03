// SIR V2 — GET /api/push/vapid-public
//
// Devuelve la VAPID public key para que el browser haga la subscripción.
// Público (todos los users usan la misma pubkey del sistema).

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET() {
  const pub = process.env.VAPID_PUBLIC_KEY?.trim() ?? ''
  return NextResponse.json({ configured: !!pub, publicKey: pub })
}
