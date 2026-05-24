'use client'
// SIR V2 - /memory
// Vista de memorias del sistema. Solo lectura.
import { useState, useMemo } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Card, Badge, Input, Select, SectionHeader, EmptyState } from '@/components/ui'
import { useMemoryStore } from '@/stores'
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

  const memories = useMemo(() => {
    if (search.trim()) return queryMemories(search.trim())
    if (typeFilter !== 'all') return getMemoriesByType(typeFilter)
    return getRecentMemories(50)
  }, [search, typeFilter, getRecentMemories, queryMemories, getMemoriesByType])

  const recentCount = getRecentMemories(50).length

  return (
    <AppShell>
      <SectionHeader
        title="Memoria"
        subtitle={`${recentCount} memoria${recentCount !== 1 ? 's' : ''} en el sistema`}
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Total', value: String(recentCount) },
          { label: 'Mostrando', value: String(memories.length) },
          { label: 'Filtro', value: typeFilter === 'all' ? 'Todos' : TYPE_LABEL[typeFilter] },
        ].map((s) => (
          <Card key={s.label} className="flex flex-col gap-1">
            <div className="text-[9px] font-mono text-[#333] uppercase tracking-widest">{s.label}</div>
            <div className="text-xl font-mono font-bold text-[#f5f5f5]">{s.value}</div>
          </Card>
        ))}
      </div>

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

      {/* Lista de memorias */}
      {memories.length === 0 ? (
        <EmptyState
          title="Sin memorias"
          description={search ? `No hay resultados para "${search}"` : 'No hay memorias en el sistema aun.'}
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
                  <Badge variant={TYPE_VARIANT[memory.type]}>{TYPE_LABEL[memory.type]}</Badge>
                  <span className="text-[9px] font-mono text-[#333]">
                    I:{memory.importance}/10
                  </span>
                </div>
              </div>

              {/* Content */}
              <div className="text-xs text-[#555] font-mono leading-relaxed">
                {memory.content}
              </div>

              {/* Emotional charge */}
              <div className="flex items-center gap-3 text-[9px] font-mono text-[#333]">
                <span>
                  Carga emocional:{' '}
                  <span className={memory.emotionalCharge >= 0 ? 'text-[#4a4]' : 'text-[#a44]'}>
                    {memory.emotionalCharge > 0 ? '+' : ''}{memory.emotionalCharge.toFixed(1)}
                  </span>
                </span>
                {memory.entities.length > 0 && (
                  <span>Entidades: {memory.entities.join(', ')}</span>
                )}
              </div>

              {/* Tags */}
              {memory.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {memory.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-[9px] font-mono text-[#333] border border-[#1a1a1a] px-1.5 py-0.5 rounded"
                    >
                      #{tag}
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
