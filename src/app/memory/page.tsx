'use client'
// SIR V2 - /memory
// Vista de memorias del sistema. Solo lectura.
import { useState, useMemo } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Card, Badge, Input, Select, SectionHeader, EmptyState } from '@/components/ui'
import { useMemoryStore } from '@/stores'
import { buildMemoryContext } from '@/engines/memory'
import type { MemoryType } from '@/types'

const TYPE_LABEL: Record<MemoryType, string> = {
  episodic: 'Episodica',
  semantic: 'Semantica',
  emotional: 'Emocional',
  relational: 'Relacional',
  temporal: 'Temporal',
  predictive: 'Predictiva',
}

const TYPE_VARIANT: Record<MemoryType, 'default' | 'warn' | 'bad' | 'muted'> = {
  episodic: 'default',
  semantic: 'muted',
  emotional: 'warn',
  relational: 'default',
  temporal: 'muted',
  predictive: 'warn',
}

const ALL_TYPES: MemoryType[] = [
  'episodic', 'semantic', 'emotional', 'relational', 'temporal', 'predictive',
]

export default function MemoryPage() {
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

  return (
    <AppShell>
      <SectionHeader
        title="Memoria"
        subtitle={`${memoryContext.totalMemories} memoria${memoryContext.totalMemories !== 1 ? 's' : ''} en el sistema`}
      />

      {/* Context Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Total', value: String(memoryContext.totalMemories) },
          { label: 'Imp. Promedio', value: memoryContext.totalMemories > 0 ? memoryContext.averageImportance.toFixed(1) : '—' },
          { label: 'Carga Emoc.', value: memoryContext.totalMemories > 0 ? memoryContext.averageEmotionalCharge.toFixed(1) : '—' },
          { label: 'Top / Recientes', value: `${memoryContext.topMemories.length} / ${memoryContext.recentMemories.length}` },
        ].map((s) => (
          <Card key={s.label} className="flex flex-col gap-1">
            <div className="text-[9px] font-mono text-[#333] uppercase tracking-widest">{s.label}</div>
            <div className="text-xl font-mono font-bold text-[#f5f5f5]">{s.value}</div>
          </Card>
        ))}
      </div>

      {/* Distribution by type */}
      {Object.keys(memoryContext.memoriesByType).length > 0 && (
        <div className="mb-4">
          <div className="text-[9px] font-mono text-[#333] uppercase tracking-widest mb-2">Distribucion por tipo</div>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(memoryContext.memoriesByType) as [MemoryType, number][]).map(([type, count]) => (
              <div key={type} className="flex items-center gap-1.5">
                <Badge label={TYPE_LABEL[type]} variant={TYPE_VARIANT[type]} />
                <span className="text-xs font-mono text-[#666]">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Critical entities */}
      {memoryContext.criticalEntities.length > 0 && (
        <div className="mb-6">
          <div className="text-[9px] font-mono text-[#333] uppercase tracking-widest mb-2">Entidades criticas</div>
          <div className="flex flex-wrap gap-2">
            {memoryContext.criticalEntities.slice(0, 5).map(({ entityId, count }) => (
              <Card key={entityId} className="flex items-center gap-2 px-2 py-1">
                <span className="text-xs font-mono text-[#f5f5f5]">{entityId}</span>
                <span className="text-[9px] font-mono text-[#333]">{'×'}{count}</span>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <Input
          placeholder="Buscar en memorias..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            if (e.target.value) setTypeFilter('all')
          }}
          className="flex-1 min-w-[200px]"
        />
        <Select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value as MemoryType | 'all')
            setSearch('')
          }}
        >
          <option value="all">Todos los tipos</option>
          {ALL_TYPES.map((t) => (
            <option key={t} value={t}>{TYPE_LABEL[t]}</option>
          ))}
        </Select>
      </div>

      {/* Mostrando info */}
      <div className="text-[9px] font-mono text-[#333] mb-3">
        Mostrando {memories.length} de {memoryContext.totalMemories}
        {typeFilter !== 'all' && ` · Filtro: ${TYPE_LABEL[typeFilter as MemoryType]}`}
        {search.trim() && ` · Busqueda: "${search.trim()}"`}
      </div>

      {/* Lista de memorias */}
      {memories.length === 0 ? (
        <EmptyState
          message={search ? `Sin resultados para "${search}"` : 'No hay memorias en el sistema aun.'}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {memories.map((memory) => (
            <Card key={memory.id} className="flex flex-col gap-2">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-mono text-[#f5f5f5] font-medium leading-snug">
                    {memory.title}
                  </div>
                  <div className="text-[9px] font-mono text-[#333] mt-0.5">
                    {new Date(memory.timestamp).toLocaleDateString('es-PE', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <Badge label={TYPE_LABEL[memory.type]} variant={TYPE_VARIANT[memory.type]} />
                  <span className="text-[9px] font-mono text-[#333]">
                    I:{memory.importance}/10
                  </span>
                </div>
              </div>
              {/* Content */}
              <div className="text-xs font-mono text-[#888] leading-relaxed line-clamp-2">
                {memory.content}
              </div>
              {/* Tags + Entities */}
              {(memory.tags.length > 0 || memory.entities.length > 0) && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {memory.tags.map((tag) => (
                    <span key={tag} className="text-[9px] font-mono text-[#444] bg-[#111] px-1.5 py-0.5 rounded">
                      #{tag}
                    </span>
                  ))}
                  {memory.entities.map((entity) => (
                    <span key={entity} className="text-[9px] font-mono text-[#555] bg-[#0a0a0a] border border-[#222] px-1.5 py-0.5 rounded">
                      @{entity}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  )
}
