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
     * - archivos con extension de imagen (svg, png, jpg, jpeg, gif, webp)
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
