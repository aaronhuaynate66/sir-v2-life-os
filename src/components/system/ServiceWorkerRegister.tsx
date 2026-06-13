'use client'

// SIR V2 — Registra el service worker (/sw.js) en el cliente. Necesario para PWA
// instalable + Web Push. Fail-soft: si el navegador no soporta SW, no hace nada.
import { useEffect } from 'react'

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // best-effort: sin SW no hay push, pero la app funciona igual.
      })
    }
  }, [])
  return null
}
