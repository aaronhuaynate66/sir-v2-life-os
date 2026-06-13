import type { MetadataRoute } from 'next'

// SIR V2 — Web App Manifest (PWA). Requisito para instalar en home screen y para
// que iOS habilite Web Push (iOS 16.4+, solo PWAs instaladas con manifest + SW).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SIR V2 — Life Operating System',
    short_name: 'SIR',
    description: 'Tu sistema operativo cognitivo-relacional.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    lang: 'es',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
