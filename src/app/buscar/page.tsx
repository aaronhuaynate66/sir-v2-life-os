'use client'
// SIR V2 — /buscar (Fase 3b: búsqueda semántica)
//
// Pregunta en lenguaje natural ("qué pasó cuando me sentía ansioso por
// trabajo") -> embeddea la query y matchea contra memories.embedding vía
// /api/search. Incluye un botón para indexar (backfillear embeddings) las
// memorias que falten, vía /api/memories/embed.

import { useState } from 'react'
import { Search, Sparkles, Loader2, AlertCircle, RefreshCw } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { SemanticSearchResult } from '@/app/api/search/route'

interface ApiError {
  status: number
  message: string
  detail?: string
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let b: { error?: string; detail?: string } = {}
    try { b = await res.json() } catch { /* sin body */ }
    throw { status: res.status, message: b.error ?? `HTTP ${res.status}`, detail: b.detail } as ApiError
  }
  return (await res.json()) as T
}

const ABS = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric' })

const TYPE_LABEL: Record<string, string> = {
  episodic: 'Episódica', semantic: 'Semántica', emotional: 'Emocional',
  relational: 'Relacional', temporal: 'Temporal', predictive: 'Predictiva', social: 'Social',
}

export default function BuscarPage() {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SemanticSearchResult[] | null>(null)
  const [error, setError] = useState<ApiError | null>(null)

  const [indexing, setIndexing] = useState(false)
  const [indexMsg, setIndexMsg] = useState<string | null>(null)

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault()
    const q = query.trim()
    if (!q || searching) return
    setSearching(true)
    setError(null)
    try {
      const { results } = await postJson<{ results: SemanticSearchResult[] }>('/api/search', { query: q })
      setResults(results)
    } catch (e) {
      setError(e as ApiError)
      setResults(null)
    } finally {
      setSearching(false)
    }
  }

  async function indexMemories() {
    if (indexing) return
    setIndexing(true)
    setIndexMsg(null)
    setError(null)
    try {
      const r = await postJson<{ embedded: number; remaining: number; model: string }>('/api/memories/embed', {})
      setIndexMsg(
        r.embedded === 0 && r.remaining === 0
          ? 'No hay memorias para indexar todavía.'
          : `Indexadas ${r.embedded} memoria${r.embedded === 1 ? '' : 's'}. Quedan ${r.remaining} sin indexar.`,
      )
    } catch (e) {
      setError(e as ApiError)
    } finally {
      setIndexing(false)
    }
  }

  return (
    <AppShell>
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-1">SIR V2</div>
        <div className="flex items-center gap-3">
          <Search size={28} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Búsqueda semántica</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Preguntá en lenguaje natural sobre tus memorias. Busca por significado, no por palabras exactas.
        </p>
      </div>

      <form onSubmit={runSearch} className="flex gap-2 mb-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ej: qué pasó cuando me sentía ansioso por trabajo"
          className="flex-1"
          autoFocus
        />
        <Button type="submit" disabled={searching || !query.trim()}>
          {searching ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} strokeWidth={1.75} />}
          <span className="ml-1.5 hidden sm:inline">Buscar</span>
        </Button>
      </form>

      <div className="flex items-center justify-between gap-2 mb-6 flex-wrap">
        <p className="text-[11px] text-muted-foreground/70">
          ¿Resultados vacíos? Indexá tus memorias primero (genera los embeddings).
        </p>
        <Button size="sm" variant="ghost" onClick={indexMemories} disabled={indexing}>
          {indexing ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <RefreshCw size={13} strokeWidth={1.75} className="mr-1.5" />}
          Indexar memorias
        </Button>
      </div>

      {indexMsg && (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-xs text-emerald-400 mb-4">
          {indexMsg}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs space-y-1 mb-4">
          <div className="flex items-center gap-1.5 font-medium text-red-400">
            <AlertCircle size={12} strokeWidth={2} aria-hidden="true" />
            Error HTTP {error.status}: {error.message}
          </div>
          {error.detail && <div className="text-muted-foreground">{error.detail}</div>}
          {(error.status === 500 || error.status === 502) && (
            <div className="text-muted-foreground/70 pt-1">
              Verificá que la migración 0015 esté aplicada y que OPENAI_API_KEY esté configurada en el server.
            </div>
          )}
        </div>
      )}

      {results !== null && !searching && (
        results.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            Sin resultados. Probá reformular o indexá tus memorias.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
              {results.length} resultado{results.length === 1 ? '' : 's'}
            </div>
            {results.map((r) => (
              <Card key={r.id} className="shadow-none">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-wider shrink-0">
                        {TYPE_LABEL[r.type] ?? r.type}
                      </Badge>
                      {r.title && <span className="text-sm font-medium truncate">{r.title}</span>}
                    </div>
                    <Badge variant="outline" className="text-[10px] font-mono tabular-nums shrink-0 border-accent/30 bg-accent/10 text-accent-foreground">
                      {Math.round(r.similarity * 100)}%
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">{r.content}</p>
                  <div className="text-[10px] font-mono text-muted-foreground/50 mt-2">
                    {r.occurredAt ? ABS.format(new Date(r.occurredAt)) : ''}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      )}
    </AppShell>
  )
}
