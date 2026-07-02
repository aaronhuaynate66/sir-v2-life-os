'use client'
// SIR V2 — Botón "Regenerar resumen" para una observation whatsapp_chat.
// Aparece SOLO cuando needsResummary(obs) devuelve true (summary template/vacío
// + rawMessages persistidos). Al click: POST /api/observations/rebuild-summary
// con force=false por default. Si sale ok, refresca la ficha.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCcw } from 'lucide-react'

import { cn } from '@/lib/utils'

interface Props {
  observationId: string
  className?: string
}

export function RebuildSummaryButton({ observationId, className }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/observations/rebuild-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ observation_id: observationId }),
      })
      const j = (await res.json()) as { ok?: boolean; error?: string; skipped?: boolean }
      if (!res.ok) { setError(j.error ?? `HTTP ${res.status}`); return }
      if (j.skipped) { setError('El resumen ya parece decente. No regeneré nada.'); return }
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/10 disabled:opacity-50"
        aria-label="Regenerar resumen con Claude"
        title="Este chat tiene un resumen genérico. Reconstruilo con Claude sobre los mensajes guardados."
      >
        {busy ? <Loader2 size={10} className="animate-spin" /> : <RefreshCcw size={10} strokeWidth={2} />}
        Regenerar resumen
      </button>
      {error && <span className="text-[10px] text-warn">{error}</span>}
    </div>
  )
}
