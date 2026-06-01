import type { NextConfig } from 'next'

/**
 * Content-Security-Policy (Auditoría técnica — quick-win de Security).
 *
 * Se aplica en modo **Report-Only** a propósito: NO bloquea, solo reporta
 * violaciones (consola del browser + report-uri si se configura). Es el modo
 * seguro para prod — permite verificar en vivo que la política no rompe nada
 * (Supabase REST/Realtime, Vercel Analytics, fonts, previews) ANTES de pasar a
 * enforce. Para enforcar: renombrar el header a 'Content-Security-Policy' una
 * vez confirmado que no hay violaciones del happy path.
 *
 * Fuentes permitidas (por qué):
 * - script/style 'unsafe-inline': Next App Router inyecta scripts/estilos
 *   inline de bootstrap+hydration sin nonce. 'unsafe-eval' por compatibilidad
 *   de chunks de webpack/libs.
 * - va.vercel-scripts.com: script de Vercel Analytics.
 * - *.supabase.co (https + wss): REST, Storage e import de Realtime (websocket).
 * - *.vercel-insights.com: beacon de Web Vitals de Vercel Analytics.
 * - img data:/blob:: previews de captura (imágenes en memoria) y avatares.
 * - media blob:: nota de voz (MediaRecorder produce blobs).
 * NB: Anthropic/OpenAI NO van en connect-src — esas llamadas son server-side,
 * el browser nunca las hace (no las alcanza la CSP).
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://va.vercel-scripts.com https://*.vercel-insights.com",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join('; ')

/**
 * Security headers globales (Auditoría — quick-win XS).
 * HSTS lo setea Vercel automáticamente en el edge → NO lo duplicamos acá.
 * Permissions-Policy: bloqueamos lo que la app NO usa (cámara, geo: la captura
 * de fotos es upload de archivo, no getUserMedia). microphone=(self) porque la
 * NOTA DE VOZ sí usa MediaRecorder + getUserMedia (ver NotaDeVozPanel.tsx).
 */
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(self)' },
  { key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY },
]

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * Security headers en TODAS las rutas. Ver SECURITY_HEADERS / CSP_REPORT_ONLY.
   */
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }]
  },

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
