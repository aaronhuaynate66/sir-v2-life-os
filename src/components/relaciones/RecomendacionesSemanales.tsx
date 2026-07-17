'use client'
// SIR V2 — RecomendacionesSemanales: acciones concretas para esta semana con
// esta persona. Generadas por Claude Sonnet, cacheadas por (user, persona,
// semana). Marca cada una como hecha con click en el checkbox.

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { Lightbulb, Loader2, RefreshCcw, CheckCircle2, Circle, AlertCircle } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { OriginBadge } from './OriginBadge'
import { cn } from '@/lib/utils'

interface Recommendation {
  id: string
  text: string
  deadline?: string
  done: boolean
}

interface Props {
  personId: string
  personName: string
}

export function RecomendacionesSemanales({ personId, personName }: Props) {
  const [recs, setRecs] = useState<Recommendation[] | null>(null)
  const [weekStart, setWeekStart] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [busy, setBusy] = useState<false | 'load' | 'gen'>(false)
  const [error, setError] = useState<string | null>(null)

  const loadCache = useCallback(async () => {
    setBusy('load'); setError(null)
    try {
      const res = await fetch(`/api/estado-persona/recomendaciones-semanales?person_id=${encodeURIComponent(personId)}`, { cache: 'no-store' })
      if (!res.ok) return
      const j = (await res.json()) as { cached?: boolean; recommendations?: Recommendation[]; generatedAt?: string; weekStart?: string }
      if (j.weekStart) setWeekStart(j.weekStart)
      if (j.cached && j.recommendations) {
        setRecs(j.recommendations)
        setGeneratedAt(j.generatedAt ?? null)
      }
    } catch { /* silent */ } finally { setBusy(false) }
  }, [personId])

  useEffect(() => { void loadCache() }, [loadCache])

  async function generate(force = false) {
    setBusy('gen'); setError(null)
    try {
      const res = await fetch('/api/estado-persona/recomendaciones-semanales', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: personId, force }),
      })
      const j = (await res.json()) as { recommendations?: Recommendation[]; generatedAt?: string; error?: string }
      if (!res.ok) { setError(j.error ?? `HTTP ${res.status}`); return }
      if (j.recommendations) {
        setRecs(j.recommendations)
        setGeneratedAt(j.generatedAt ?? null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }

  async function toggleDone(recId: string, done: boolean) {
    if (!recs) return
    const prev = recs
    // Optimistic.
    setRecs(recs.map((r) => r.id === recId ? { ...r, done } : r))
    const revert = () => {
      setRecs(prev)
      toast.error('No se pudo guardar el cambio', { description: 'Revertido. Prueba de nuevo.' })
    }
    try {
      const res = await fetch('/api/estado-persona/recomendaciones-semanales', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: personId, rec_id: recId, done }),
      })
      if (!res.ok) revert()
    } catch { revert() }
  }

  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mb-4">
      <Card className="shadow-none">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Lightbulb size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
            <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-sans">
              Esta semana con {personName.split(' ')[0]}
            </span>
            {recs && recs.length > 0 && (
              <Badge variant="outline" className="text-[10px] font-mono">
                {recs.filter((r) => !r.done).length} de {recs.length}
              </Badge>
            )}
            <OriginBadge origin="ai" />
            {weekStart && (
              <span className="text-[10px] text-muted-foreground/60 ml-auto">Semana de {weekStart}</span>
            )}
          </div>

          {recs == null && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => void generate(false)} disabled={busy !== false}>
                {busy === 'gen' ? <><Loader2 size={11} className="mr-1.5 animate-spin" /> Generando…</> : 'Pedir sugerencias'}
              </Button>
              <span className="text-[11px] text-muted-foreground">
                Claude lee todo lo cargado y devuelve 3-5 acciones concretas para esta semana.
              </span>
            </div>
          )}

          {recs && recs.length > 0 && (
            <ul className="space-y-1.5">
              {recs.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => void toggleDone(r.id, !r.done)}
                    className={cn(
                      'w-full text-left flex items-start gap-2 rounded-md p-2 hover:bg-muted/40 transition-colors',
                      r.done && 'opacity-50',
                    )}
                  >
                    {r.done ? <CheckCircle2 size={13} className="text-ok mt-0.5 flex-shrink-0" /> : <Circle size={13} className="text-muted-foreground/70 mt-0.5 flex-shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-sm text-foreground leading-relaxed', r.done && 'line-through')}>{r.text}</p>
                      {r.deadline && (
                        <p className="text-[10px] text-muted-foreground/70 font-mono mt-0.5">deadline: {r.deadline}</p>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {recs && recs.length > 0 && (
            <div className="flex items-center gap-2 pt-1 text-[10px] opacity-70">
              <span>Generadas {generatedAt ? new Date(generatedAt).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</span>
              <button
                type="button"
                onClick={() => void generate(true)}
                disabled={busy !== false}
                className="inline-flex items-center gap-1 hover:text-foreground underline underline-offset-2 ml-auto"
              >
                {busy === 'gen' ? <Loader2 size={9} className="animate-spin" /> : <RefreshCcw size={9} />}
                Regenerar
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-1.5 text-[11px] text-bad">
              <AlertCircle size={11} className="mt-0.5" /> {error}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
