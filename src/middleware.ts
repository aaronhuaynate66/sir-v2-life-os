// SIR V2 — Next.js middleware
// Corre en cada request (excepto static assets). Refresca sesion + protege rutas.

import { NextResponse, type NextRequest } from 'next/server'

// Nombre del cookie de Supabase auth. @supabase/ssr genera cookies con prefijo
// `sb-<project-ref>-auth-token` (chunked). Un chequeo por prefijo evita cargar
// la libreria completa cuando ni siquiera hay sesion.
const SUPABASE_AUTH_COOKIE_PREFIX = 'sb-'
const SUPABASE_AUTH_COOKIE_SUFFIX = 'auth-token'

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  for (const c of request.cookies.getAll()) {
    if (c.name.startsWith(SUPABASE_AUTH_COOKIE_PREFIX) && c.name.includes(SUPABASE_AUTH_COOKIE_SUFFIX)) {
      return true
    }
  }
  return false
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const isAuthRoute = pathname.startsWith('/auth')
  const hasCookie = hasSupabaseAuthCookie(request)

  // Sin cookie y ruta protegida → redirect directo sin importar Supabase.
  // Antes: el middleware SIEMPRE cargaba @supabase/ssr (147 KB de bundle) para
  // llamar a getUser() en cada request. Ahora, los visitantes anonimos pagan
  // ZERO del SDK — solo el cookie check.
  if (!hasCookie && !isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // Sin cookie en ruta de auth → dejar seguir (login page).
  if (!hasCookie) return NextResponse.next({ request })

  // Con cookie: cargamos lazy el helper de Supabase y refrescamos el token.
  // Dynamic import: los usuarios logueados pagan la libreria (cacheada tras el
  // primer request), los anonimos no la ven nunca.
  const { updateSession } = await import('@/lib/supabase/middleware')
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Excluye:
     * - _next/static, _next/image: assets de Next
     * - favicon, robots, sitemap, manifest.webmanifest (PWA — devolver JSON no HTML del redirect)
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
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|api|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
