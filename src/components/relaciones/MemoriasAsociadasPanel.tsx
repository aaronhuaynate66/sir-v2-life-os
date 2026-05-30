'use client'
// SIR V2 — MemoriasAsociadasPanel
//
// Sesion 4 (Memorias asociadas, PR #2 sidebar).
//
// Sidebar/panel que renderiza las memorias materializadas de una persona
// (tabla `memories` filtradas por person_id + RLS, ya curadas via PR #1
// getMemoriesForPerson). Boton "Generar/Actualizar" llama al endpoint
// POST /api/memories/backfill — re-derivar es idempotente por el unique
// index (user_id, source_event_id) de la migration 0012.
//
// Boundary intencional: SOLO lee la fuente server-side (memorias pasadas
// como prop desde page.tsx). NO toca useMemoryStore (Zustand). El store
// puede quedar desfasado hasta el proximo pull manual del usuario; en
// PR #2 es aceptable. Extraccion automatica on-capture queda diferida.

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Sparkles, Loader2, Camera, AlertCircle, ChevronDown } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useMounted } from '@/hooks/useMounted'
import type { Memory, MemoryType } from '@/types'

/** Cuántas memorias mostrar antes de colapsar (volumen V1: 20+). */
const INITIAL_VISIBLE = 8

export interface MemoriasAsociadasPanelProps {
  /** Memorias ya fetched server-side via getMemoriesForPerson, ordenadas
   *  por occurred_at DESC. */
  memories: Memory[]
  /** id de la persona — necesario para el POST de backfill. */
  personId: string
}

interface BackfillError {
  status: number
  message: string
  detail?: string
}

interface BackfillSuccess {
  insertedCount: number
  generated: number
  skipped: number
}

const TYPE_LABEL: Record<Memory['type'], string> = {
  episodic: 'Episódica',
  semantic: 'Semántica',
  emotional: 'Emocional',
  relational: 'Relacional',
  temporal: 'Temporal',
  predictive: 'Predictiva',
  social: 'Social',
}

const TYPE_BADGE_VARIANT: Record<
  Memory['type'],
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  episodic: 'secondary',
  semantic: 'outline',
  emotional: 'default',
  relational: 'outline',
  temporal: 'outline',
  predictive: 'outline',
  social: 'default',
}

export function MemoriasAsociadasPanel({ memories, personId }: MemoriasAsociadasPanelProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<BackfillError | null>(null)
  const [lastResult, setLastResult] = useState<BackfillSuccess | null>(null)
  // Filtro por tipo (#15) + colapso para volumen.
  const [activeType, setActiveType] = useState<MemoryType | 'all'>('all')
  const [showAll, setShowAll] = useState(false)

  // Conteo por tipo presente (para los chips de filtro).
  const typeCounts = useMemo(() => {
    const counts = new Map<MemoryType, number>()
    for (const m of memories) counts.set(m.type, (counts.get(m.type) ?? 0) + 1)
    return counts
  }, [memories])

  const filtered = useMemo(
    () => (activeType === 'all' ? memories : memories.filter((m) => m.type === activeType)),
    [memories, activeType],
  )
  const visible = showAll ? filtered : filtered.slice(0, INITIAL_VISIBLE)

  const onBackfill = useCallback(async () => {
    setLoading(true)
    setError(null)
    setLastResult(null)
    try {
      const res = await fetch('/api/memories/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: personId }),
      })
      if (!res.ok) {
        let body: { error?: string; detail?: string } = {}
        try {
          body = await res.json()
        } catch {
          /* no body */
        }
        setError({
          status: res.status,
          message: body.error ?? `HTTP ${res.status}`,
          detail: body.detail,
        })
        return
      }
      const json = (await res.json()) as BackfillSuccess
      setLastResult(json)
      // Refresca la page (Server Component) para re-fetchar memorias.
      router.refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError({ status: 0, message: 'Red caída o request abortado', detail: msg })
    } finally {
      setLoading(false)
    }
  }, [personId, router])

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles
              size={14}
              strokeWidth={1.75}
              className="text-muted-foreground/70"
              aria-hidden="true"
            />
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
              Memorias asociadas
            </div>
            {memories.length > 0 && (
              <Badge variant="outline" className="text-[10px] font-mono">
                {memories.length}
              </Badge>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={onBackfill}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={12} className="mr-2 animate-spin" />
                {memories.length === 0 ? 'Generando…' : 'Actualizando…'}
              </>
            ) : memories.length === 0 ? (
              'Generar desde el historial'
            ) : (
              'Actualizar memorias'
            )}
          </Button>
        </div>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs space-y-1 mb-3">
            <div className="flex items-center gap-1.5 font-medium text-red-400">
              <AlertCircle size={12} strokeWidth={2} aria-hidden="true" />
              Error HTTP {error.status}: {error.message}
            </div>
            {error.detail && <div className="text-muted-foreground">{error.detail}</div>}
          </div>
        )}

        {lastResult && (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs mb-3">
            <span className="text-emerald-400 font-medium">
              {lastResult.insertedCount === 0
                ? 'Sin memorias nuevas.'
                : `Se generaron ${lastResult.insertedCount} memoria${lastResult.insertedCount === 1 ? '' : 's'}.`}
            </span>{' '}
            <span className="text-muted-foreground font-mono">
              generated={lastResult.generated} · inserted={lastResult.insertedCount} · skipped=
              {lastResult.skipped}
            </span>
          </div>
        )}

        {memories.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Filtro por tipo: chips con conteo. Solo si hay >1 tipo. */}
            {typeCounts.size > 1 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                <FilterChip
                  label="Todas"
                  count={memories.length}
                  active={activeType === 'all'}
                  onClick={() => {
                    setActiveType('all')
                    setShowAll(false)
                  }}
                />
                {Array.from(typeCounts.entries())
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => (
                    <FilterChip
                      key={type}
                      label={TYPE_LABEL[type] ?? type}
                      count={count}
                      active={activeType === type}
                      onClick={() => {
                        setActiveType(type)
                        setShowAll(false)
                      }}
                    />
                  ))}
              </div>
            )}

            <MemoryList memories={visible} />

            {filtered.length > INITIAL_VISIBLE && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowAll((v) => !v)}
                className="mt-3 w-full"
              >
                <ChevronDown
                  size={13}
                  strokeWidth={1.75}
                  className={cn('mr-1.5 transition-transform', showAll && 'rotate-180')}
                />
                {showAll
                  ? 'Ver menos'
                  : `Ver todas (${filtered.length})`}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'text-[11px] rounded-full border px-2.5 py-0.5 transition-colors',
        active
          ? 'border-accent/50 bg-accent/10 text-foreground'
          : 'border-border text-muted-foreground hover:border-accent/40 hover:text-foreground',
      )}
      aria-pressed={active}
    >
      {label} <span className="font-mono tabular-nums opacity-70">{count}</span>
    </button>
  )
}

function EmptyState() {
  return (
    <div className="text-sm text-muted-foreground space-y-2">
      <p>Sin memorias todavía.</p>
      <p className="text-xs leading-relaxed">
        Las memorias se derivan automáticamente de{' '}
        <span className="font-mono text-foreground/80">relationships.history</span> cuando
        subís conversaciones desde{' '}
        <Link
          href="/captura"
          className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
        >
          <Camera size={11} strokeWidth={1.75} aria-hidden="true" />
          /captura
        </Link>
        . El botón <span className="font-mono text-foreground/80">Generar</span> de arriba
        materializa el historial actual; re-correrlo es idempotente.
      </p>
    </div>
  )
}

function MemoryList({ memories }: { memories: Memory[] }) {
  // El tiempo relativo (formatRelative usa Date.now()) se difiere a post-mount.
  const mounted = useMounted()
  return (
    <ul className="space-y-3">
      {memories.map((m) => (
        <li
          key={m.id}
          className="rounded-md border border-border/60 bg-muted/10 p-3 space-y-1.5"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Badge
              variant={TYPE_BADGE_VARIANT[m.type] ?? 'outline'}
              className="text-[10px] font-mono uppercase tracking-wider"
            >
              {TYPE_LABEL[m.type] ?? m.type}
            </Badge>
            <span className="text-[10px] text-muted-foreground/70 font-mono">
              {mounted ? formatRelative(m.timestamp) : ''}
            </span>
          </div>
          <p className="text-sm text-foreground leading-relaxed">{m.content}</p>
          {m.tags && m.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {m.tags.slice(0, 6).map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px] font-mono">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

const ABS_FORMATTER = new Intl.DateTimeFormat('es', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const DAY_MS = 86_400_000

function formatRelative(iso: string): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  const diffMs = Date.now() - t
  if (diffMs < 0) return ABS_FORMATTER.format(new Date(t))
  const days = Math.floor(diffMs / DAY_MS)
  if (days < 1) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 7) return `hace ${days} días`
  if (days < 30) {
    const weeks = Math.floor(days / 7)
    return weeks === 1 ? 'hace 1 semana' : `hace ${weeks} semanas`
  }
  if (days < 365) {
    const months = Math.floor(days / 30)
    return months === 1 ? 'hace 1 mes' : `hace ${months} meses`
  }
  return ABS_FORMATTER.format(new Date(t))
}
