'use client'
// SIR V2 — Lectura estratégica de empresa (escalón 3b). Botón on-demand →
// POST /api/empresas/strategic { slug } → muestra el insight. No auto (respeta
// el filtro paz: la IA asiste, no satura).

import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'

export function CompanyStrategicRead({ slug }: { slug: string }) {
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; text?: string }>({
    status: 'idle',
  })

  async function gen() {
    if (state.status === 'loading') return
    setState({ status: 'loading' })
    try {
      const res = await fetch('/api/empresas/strategic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
      const data = (await res.json()) as { insight?: string; detail?: string; error?: string }
      if (!res.ok || !data.insight) {
        setState({ status: 'error', text: data.detail || data.error || 'No se pudo generar la lectura.' })
        return
      }
      setState({ status: 'ready', text: data.insight })
    } catch {
      setState({ status: 'error', text: 'No se pudo generar la lectura.' })
    }
  }

  return (
    <section className="space-y-2">
      <h2 className="text-sm uppercase tracking-wide text-muted-foreground">Lectura estratégica</h2>
      {state.status === 'ready' && state.text ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-card px-4 py-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-soft-foreground" aria-hidden="true" />
          <p className="text-[13px] leading-relaxed text-foreground/90">{state.text}</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={gen}
          disabled={state.status === 'loading'}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:border-foreground/30 disabled:opacity-50"
        >
          {state.status === 'loading' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          )}
          {state.status === 'loading' ? 'Leyendo el tablero…' : 'Generar lectura estratégica'}
        </button>
      )}
      {state.status === 'error' && state.text && (
        <p className="text-xs text-muted-foreground">{state.text}</p>
      )}
    </section>
  )
}
