'use client'
// SIR V2 — Banner global "sin créditos de IA".
// Hace UN chequeo por carga (/api/ai/health) y, si la IA está caída por falta
// de créditos, muestra una alerta clara arriba en vez del error críptico que
// veía el usuario por feature. Cachea el caso OK en sessionStorage para no
// gastar una llamada por navegación. La API de Anthropic no expone saldo, así
// que esto es reactivo (avisa cuando falla); el control proactivo (auto-reload
// + alertas) se configura en la consola de Anthropic.
import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

import { AI_CREDIT_BANNER } from '@/lib/ai/billingError'

const OK_KEY = 'sir.ai-credit-ok'

export function AiCreditBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    let alive = true
    try {
      if (sessionStorage.getItem(OK_KEY) === '1') return
    } catch { /* sessionStorage no disponible: seguimos con el fetch */ }

    fetch('/api/ai/health')
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return
        if (j?.reason === 'credits') setShow(true)
        else if (j?.ok) { try { sessionStorage.setItem(OK_KEY, '1') } catch { /* noop */ } }
      })
      .catch(() => { /* sin red: no molestamos */ })

    return () => { alive = false }
  }, [])

  if (!show) return null

  return (
    <div
      role="alert"
      className="print:hidden flex items-start gap-2 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-200"
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p className="flex-1 leading-snug">
        {AI_CREDIT_BANNER}{' '}
        <a
          href="https://console.anthropic.com/settings/billing"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-amber-100"
        >
          Abrir Billing
        </a>
      </p>
      <button
        type="button"
        onClick={() => setShow(false)}
        aria-label="Cerrar aviso"
        className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
      >
        <X size={16} />
      </button>
    </div>
  )
}
