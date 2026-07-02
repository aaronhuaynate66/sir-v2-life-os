// SIR V2 — GET /api/me
//
// Smoke test / ping para verificar credenciales. Acepta session-auth O
// Authorization: Bearer sirp_<token>. Devuelve { userId, viaBearer? }.
// Sin auth → 401. Es el endpoint que un cliente externo (Claude, curl)
// usa para verificar que el token es válido antes de intentar escribir.

import { NextResponse, type NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/auth/tokens'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  return NextResponse.json({ userId: user.userId, viaBearer: !!user.tokenId })
}
