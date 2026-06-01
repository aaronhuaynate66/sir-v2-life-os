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
     * - api: los route handlers /api/* autentican por su cuenta (createClient()
     *   + getUser()) y refrescan la sesión (las cookies SÍ se pueden mutar en
     *   Route Handlers, ver lib/supabase/server.ts). Correr el middleware acá
     *   duplicaba el getUser() por request y devolvía un redirect HTML 307 en
     *   vez del 401 JSON tipado que ya emite cada route. Excluirlo: un solo
     *   getUser() + 401 JSON correcto. (Auditoría técnica — quick-win.)
     * - auth/callback: el route handler debe procesarlo solo (codes OAuth
     *   son single-use; el middleware corriendo getUser() sobre las mismas
     *   cookies del request causa interferencia con exchangeCodeForSession).
     * - archivos con extension de imagen (svg, png, jpg, jpeg, gif, webp)
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|api|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
