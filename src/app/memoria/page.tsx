'use client'
// SIR V2 - /memory
// Vista de memorias del sistema. Solo lectura.
import { useState, useMemo } from 'react'
import { Archive, Search, Tag, Sparkles, BookOpen } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SectionTitle } from '@/components/ui/section-title'
import { useMemoryStore } from '@/stores'
import { buildMemoryContext } from '@/engines/memory'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'
import { cn } from '@/lib/utils'
import type { MemoryType } from '@/types'

const TYPE_LABEL: Record<MemoryType, string> = {
  episodic: 'Episódica',
  semantic: 'Semántica',
  emotional: 'Emocional',
  relational: 'Relacional',
  temporal: 'Temporal',
  predictive: 'Predictiva',
  social: 'Social',
}

const TYPE_CLASS: Record<MemoryType, string> = {
  episodic: 'border-border bg-muted text-muted-foreground',
  semantic: 'border-border bg-muted text-muted-foreground/70',
  emotional: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  relational: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  temporal: 'border-border bg-muted text-muted-foreground/70',
  predictive: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  social: 'border-pink-500/30 bg-pink-500/10 text-pink-400',
}

const ALL_TYPES: MemoryType[] = ['episodic', 'semantic', 'emotional', 'relational', 'temporal', 'predictive', 'social']

const cardClass = 'shadow-none transition-colors duration-200 hover:border-primary/30'

export default function MemoryPage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={3} />
  return <MemoryContent />
}

function MemoryContent() {
  const { getRecentMemories, queryMemories, getMemoriesByType } = useMemoryStore()

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<MemoryType | 'all'>('all')

  const allMemories = useMemo(() => getRecentMemories(50), [getRecentMemories])
  const memoryContext = useMemo(() => buildMemoryContext(allMemories), [allMemories])

  const memories = useMemo(() => {
    if (search.trim()) return queryMemories(search.trim())
    if (typeFilter !== 'all') return getMemoriesByType(typeFilter)
    return allMemories
  }, [search, typeFilter, allMemories, queryMemories, getMemoriesByType])

  const stats = [
    { label: 'Total', value: String(memoryContext.totalMemories) },
    { label: 'Imp. Promedio', value: memoryContext.totalMemories > 0 ? memoryContext.averageImportance.toFixed(1) : '—' },
    { label: 'Carga Emoc.', value: memoryContext.totalMemories > 0 ? memoryContext.averageEmotionalCharge.toFixed(1) : '—' },
    { label: 'Top / Recientes', value: `${memoryContext.topMemories.length} / ${memoryContext.recentMemories.length}` },
  ]

  return (
    <AppShell>
      <div className="mb-8">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-1">SIR V2</div>
        <div className="flex items-center gap-3 mt-1">
          <Archive size={28} strokeWidth={1.5} className="text-muted-foreground" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Memoria</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 font-mono tabular-nums">
          {memoryContext.totalMemories} memoria{memoryContext.totalMemories !== 1 ? 's' : ''} en el sistema
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {stats.map((s) => (
          <Card key={s.label} className={cardClass}>
            <CardContent className="p-3 sm:p-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">{s.label}</div>
              <div className="text-lg sm:text-xl font-mono font-bold tabular-nums text-foreground break-all">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {Object.keys(memoryContext.memoriesByType).length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Tag size={14} strokeWidth={1.75} className="text-muted-foreground/70" />
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-sans">Distribucion por tipo</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(memoryContext.memoriesByType) as [MemoryType, number][]).map(([type, count]) => (
              <div key={type} className="flex items-center gap-1.5">
                <Badge variant="outline" className={cn('text-[10px] font-normal', TYPE_CLASS[type])}>{TYPE_LABEL[type]}</Badge>
                <span className="text-xs font-mono tabular-nums text-muted-foreground">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {memoryContext.criticalEntities.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} strokeWidth={1.75} className="text-muted-foreground/70" />
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-sans">Entidades criticas</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {memoryContext.criticalEntities.slice(0, 5).map(({ entityId, count }) => (
              <div key={entityId} className="flex items-center gap-2 px-2.5 py-1 rounded-md border border-border bg-card">
                <span className="text-xs font-mono text-foreground">{entityId}</span>
                <span className="text-[10px] font-mono tabular-nums text-muted-foreground/60">×{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
          <Input
            placeholder="Buscar en memorias..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              if (e.target.value) setTypeFilter('all')
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={typeFilter}
          onValueChange={(v) => {
            setTypeFilter(v as MemoryType | 'all')
            setSearch('')
          }}
        >
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {ALL_TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="text-[10px] font-mono tabular-nums text-muted-foreground/60 mb-3">
        Mostrando {memories.length} de {memoryContext.totalMemories}
        {typeFilter !== 'all' && ` · Filtro: ${TYPE_LABEL[typeFilter as MemoryType]}`}
        {search.trim() && ` · Búsqueda: "${search.trim()}"`}
      </div>

      {memories.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen size={24} strokeWidth={1.5} className="text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            {search ? `Sin resultados para "${search}"` : 'Todavía no hay memorias.'}
          </p>
          {!search && (
            <p className="text-xs text-muted-foreground/60 mt-1 max-w-md mx-auto leading-relaxed">
              Las memorias se arman solas a partir de tus capturas de WhatsApp: subí una conversación
              en <span className="text-foreground/80">Captura</span> y luego tocá{' '}
              <span className="text-foreground/80">Generar desde el historial</span> en el perfil de
              la persona (Relaciones → detalle).
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {memories.map((memory) => (
            <Card key={memory.id} className={cardClass}>
              <CardContent className="p-3 sm:p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground leading-snug">{memory.title}</div>
                    <div className="text-[10px] font-mono tabular-nums text-muted-foreground/60 mt-0.5">
                      {new Date(memory.timestamp).toLocaleDateString('es-PE', {
                        day: '2-digit', month: 'short', year: 'numeric',
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Badge variant="outline" className={cn('text-[10px] font-normal', TYPE_CLASS[memory.type])}>{TYPE_LABEL[memory.type]}</Badge>
                    <span className="text-[10px] font-mono tabular-nums text-muted-foreground/60">I:{memory.importance}/10</span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{memory.content}</div>
                {(memory.tags.length > 0 || memory.entities.length > 0) && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {memory.tags.map((tag) => (
                      <span key={tag} className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        #{tag}
                      </span>
                    ))}
                    {memory.entities.map((entity) => (
                      <span key={entity} className="text-[10px] font-mono text-muted-foreground/80 bg-background border border-border px-1.5 py-0.5 rounded">
                        @{entity}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  )
}
