// SIR V2 — /red/grafo → /red
//
// El grafo se movió a /red directamente (antes /red era un landing-hub
// redundante). Mantenemos esta ruta como redirect permanente para no romper
// links/bookmarks viejos.

import { permanentRedirect } from 'next/navigation'

export default function GrafoPage() {
  permanentRedirect('/red')
}
