// SIR V2 — Next.js middleware (Sesión 20b)
// Corre en cada request (excepto static assets). Refresca sesion + protege rutas.

import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Excluye:
     * - _next/static, _next/image: assets de Next
     * - favicon, robots, sitemap
     * - auth/callback: el route handler debe procesarlo solo (codes OAuth
     *   son single-use; el middleware corriendo getUser() sobre las mismas
     *   cookies del request causa interferencia con exchangeCodeForSession).
     * - archivos con extension de imagen (svg, png, jpg, jpeg, gif, webp)
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
