import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * Redirects de URLs viejas (inglés) → nuevas (español).
   * permanent: true → 308. Mantiene method (POST/etc) y ayuda cache del browser.
   *
   * Excluidos del rename:
   * - /auth/login, /auth/callback: namespace técnico OAuth.
   * - /debug/context: ruta técnica.
   * - /api/*: convención industria.
   *
   * Redirect dinámico /relationships/<uuid> → /relaciones/<slug>: el
   * static redirect manda /relationships/<uuid> → /relaciones/<uuid>,
   * luego el page /relaciones/[slug] detecta si el slug es un UUID y
   * hace el lookup en DB → 308 al slug verdadero.
   */
  async redirects() {
    return [
      { source: '/dashboard',      destination: '/panel',           permanent: true },
      { source: '/self',           destination: '/yo',              permanent: true },
      { source: '/timeline',       destination: '/historial',       permanent: true },
      { source: '/finance',        destination: '/finanzas',        permanent: true },
      { source: '/goals',          destination: '/objetivos',       permanent: true },
      { source: '/relationships',           destination: '/relaciones',           permanent: true },
      // Sub-rutas viejas (/relationships/<uuid>): redirect a /relaciones/<uuid>.
      // El page /relaciones/[slug] detecta si es UUID y hace el lookup → slug.
      { source: '/relationships/:path*',    destination: '/relaciones/:path*',    permanent: true },
      { source: '/memory',         destination: '/memoria',         permanent: true },
      { source: '/signals',        destination: '/senales',         permanent: true },
      { source: '/capture/scale',  destination: '/captura/bascula', permanent: true },
    ]
  },
}

export default nextConfig
