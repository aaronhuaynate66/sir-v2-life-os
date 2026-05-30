import type { MetadataRoute } from 'next'

// SIR V2 — robots.txt. App privada (Life OS de uso personal): todas las
// rutas requieren auth y no deben indexarse. Refuerza a nivel crawler el
// `robots: { index:false, follow:false }` que ya está en el metadata global
// del root layout. Cuando exista una landing pública, abrir solo esa ruta.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  }
}
