// SIR V2 — URL base pública de la app, para links salientes (botones de Telegram,
// push). En server puro no hay window; usamos env con fallback al dominio de prod
// (estable). NEXT_PUBLIC_SITE_URL si se define; si no, DEV_SESSION_URL (que hoy
// apunta a prod); último recurso, el dominio conocido.

export function appBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || process.env.DEV_SESSION_URL || 'https://sir-v2-life-os.vercel.app'
  return raw.replace(/\/+$/, '')
}

/** Deep-link a la bandeja de relaciones (donde vive el "¿quién es quién?" con cara). */
export function relacionesUrl(): string {
  return `${appBaseUrl()}/relaciones`
}
