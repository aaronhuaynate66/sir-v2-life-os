'use client'
// SIR V2 — /buscar (Fase 3b: búsqueda semántica)
//
// Pregunta en lenguaje natural ("qué pasó cuando me sentía ansioso por
// trabajo") -> embeddea la query y matchea contra memories.embedding vía
// /api/search. Incluye un botón para indexar (backfillear embeddings) las
// memorias que falten, vía /api/memories/embed.

import { useState } from 'react'
import { track, EVENTS } from '@/lib/analytics/track'
import { Search, Sparkles, Loader2, RefreshCw } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { postJson, toApiError, type ApiError } from '@/lib/api/errors'
import type { SemanticSearchResult } from '@/app/api/search/route'

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
  const [rebuilding, setRebuilding] = useState(false)
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
      track(EVENTS.searchPerformed, { results: results.length })
    } catch (e) {
      setError(toApiError(e))
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
      setError(toApiError(e))
    } finally {
      setIndexing(false)
    }
  }

  async function rebuildIndex() {
    if (rebuilding || indexing) return
    setRebuilding(true)
    setIndexMsg(null)
    setError(null)
    try {
      // 1. Derivar memorias de TODAS las personas (paginado por offset).
      let offset = 0
      let derivedInserted = 0
      let guard = 0
      for (;;) {
        const r = await postJson<{ nextOffset: number; remaining: number; totals: { inserted: number } }>(
          '/api/memories/derive-all',
          { offset },
        )
        derivedInserted += r.totals?.inserted ?? 0
        offset = r.nextOffset
        if (r.remaining <= 0 || ++guard > 200) break
      }
      // 2. Indexar (embeddear) las memorias que quedaron sin vector.
      let embedded = 0
      guard = 0
      for (;;) {
        const r = await postJson<{ embedded: number; remaining: number }>('/api/memories/embed', {})
        embedded += r.embedded
        if (r.remaining <= 0 || ++guard > 200) break
      }
      setIndexMsg(
        `Índice actualizado: ${derivedInserted} memoria${derivedInserted === 1 ? '' : 's'} nueva${derivedInserted === 1 ? '' : 's'} derivada${derivedInserted === 1 ? '' : 's'}, ${embedded} indexada${embedded === 1 ? '' : 's'}.`,
      )
    } catch (e) {
      setError(toApiError(e))
    } finally {
      setRebuilding(false)
    }
  }

  return (
    <AppShell>
      <div className="mb-6">
        <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-1">SIR V2</div>
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
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={indexMemories} disabled={indexing || rebuilding}>
            {indexing ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <RefreshCw size={13} strokeWidth={1.75} className="mr-1.5" />}
            Indexar memorias
          </Button>
          <Button size="sm" variant="outline" onClick={rebuildIndex} disabled={rebuilding || indexing}>
            {rebuilding ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <Sparkles size={13} strokeWidth={1.75} className="mr-1.5" />}
            Actualizar índice completo
          </Button>
        </div>
      </div>

      {indexMsg && (
        <div className="rounded-md border border-ok/30 bg-ok-soft p-2.5 text-xs text-ok mb-4">
          {indexMsg}
        </div>
      )}

      {error && (
        <ApiErrorNotice error={error} className="mb-4">
          {(error.status === 500 || error.status === 502) && (
            <div className="text-muted-foreground/70 pt-1">
              Verificá que la migración 0015 esté aplicada y que OPENAI_API_KEY esté configurada en el server.
            </div>
          )}
        </ApiErrorNotice>
      )}

      {results !== null && !searching && (
        results.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            Sin resultados. Probá reformular o indexá tus memorias.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
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
