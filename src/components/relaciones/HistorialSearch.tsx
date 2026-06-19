'use client'
// SIR V2 — Buscar dentro del historial CRUDO archivado de una persona (bitácora).
// "Buscá en lo que hablaste con X": busca en el texto completo del export.

import { useState } from 'react'
import { Search, Loader2 } from 'lucide-react'

interface Hit { date: string | null; snippet: string }

export function HistorialSearch({ personId }: { personId: string }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [meta, setMeta] = useState<{ archived: boolean; truncated?: boolean } | null>(null)

  async function run(e?: React.FormEvent) {
    e?.preventDefault()
    if (q.trim().length < 2 || loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/conversation-archive/search?person_id=${encodeURIComponent(personId)}&q=${encodeURIComponent(q.trim())}`)
      if (!res.ok) { setHits([]); return }
      const data = (await res.json()) as { hits?: Hit[]; archived?: boolean; truncated?: boolean }
      setHits(Array.isArray(data.hits) ? data.hits : [])
      setMeta({ archived: data.archived !== false, truncated: data.truncated })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Search size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
        <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Buscar en el historial</div>
      </div>
      <form onSubmit={run} className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ej. regla, viaje, propuesta…"
          className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
        />
        <button type="submit" disabled={loading || q.trim().length < 2}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-sm text-brand-foreground disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search size={14} />} Buscar
        </button>
      </form>
      {hits !== null && (
        <div className="mt-3 space-y-1.5">
          {meta && !meta.archived && (
            <p className="text-[12px] text-muted-foreground">Todavía no hay historial crudo archivado de esta persona. Subí una conversación de WhatsApp y vas a poder buscar acá.</p>
          )}
          {meta?.archived && hits.length === 0 && (
            <p className="text-[12px] text-muted-foreground">Sin coincidencias para “{q}”.</p>
          )}
          {hits.map((h, i) => (
            <div key={i} className="text-[12px] text-foreground/90 border-l-2 border-border pl-2">
              {h.date && <span className="font-mono text-muted-foreground mr-1.5">{h.date}</span>}
              {h.snippet}
            </div>
          ))}
          {meta?.truncated && hits.length > 0 && (
            <p className="text-[11px] text-muted-foreground/70 mt-1">Nota: se archivó el tramo más reciente del chat; lo muy antiguo podría no estar.</p>
          )}
        </div>
      )}
    </div>
  )
}
