'use client'
// SIR V2 â /signals
// Senales activas, manual, resolver, fuentes
import { useMemo, useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Card, Badge, Button, Input, Select, SectionHeader, EmptyState } from '@/components/ui'
import { useSignalStore } from '@/stores/useSignalStore'
import { useMemoryStore } from '@/stores'
import { buildSignalContext } from '@/engines/signal'
import { createSignalAddedMemory } from '@/engines/memory'
import type { SignalSource, SignalType, SignalUrgency, Signal } from '@/types'

const SOURCE_LABEL: Record<SignalSource, string> = {
  linkedin: 'LinkedIn', instagram: 'Instagram', calendar: 'Calendario',
  biological: 'Biologico', financial: 'Financiero', relational: 'Relacional', manual: 'Manual'
}
const TYPE_LABEL: Record<SignalType, string> = {
  opportunity: 'Oportunidad', warning: 'Advertencia', pattern: 'Patron', timing: 'Timing',
  emotional: 'Emocional', relational: 'Relacional', biological: 'Biologico', financial: 'Financiero'
}
const URGENCY_VARIANT: Record<SignalUrgency, 'bad' | 'warn' | 'default' | 'muted'> = {
  immediate: 'bad', soon: 'warn', monitor: 'default', archive: 'muted'
}
const URGENCY_LABEL: Record<SignalUrgency, string> = {
  immediate: 'Inmediata', soon: 'Pronto', monitor: 'Monitorear', archive: 'Archivar'
}

export default function SignalsPage() {
  const { signals, addSignal, resolveSignal, removeSignal } = useSignalStore()
  const { addMemory } = useMemoryStore()
  const ctx = useMemo(() => buildSignalContext(signals), [signals])

  const [source, setSource] = useState<SignalSource>('manual')
  const [type, setType] = useState<SignalType>('pattern')
  const [urgency, setUrgency] = useState<SignalUrgency>('soon')
  const [content, setContent] = useState('')
  const [meaning, setMeaning] = useState('')
  const [action, setAction] = useState('')
  const [filterSource, setFilterSource] = useState<SignalSource | 'all'>('all')
  const [showResolved, setShowResolved] = useState(false)

  function submit() {
    if (!content.trim()) return
    const s: Signal = {
      id: `sig_${Date.now()}`, source, type, content, strength: 5, urgency,
      relatedPersons: [], relatedGoals: [],
      meaning: meaning || content,
      actionRequired: !!action,
      suggestedAction: action || undefined,
      detectedAt: new Date().toISOString(),
      resolved: false
    }
    addSignal(s)
    addMemory(createSignalAddedMemory(s))
    setContent(''); setMeaning(''); setAction('')
  }

  const allSignals: Signal[] = [...signals].sort((a, b) => {
    const uOrder: Record<SignalUrgency, number> = { immediate: 0, soon: 1, monitor: 2, archive: 3 }
    return uOrder[a.urgency] - uOrder[b.urgency]
  })

  const visible = allSignals.filter(s => {
    if (!showResolved && s.resolved) return false
    if (filterSource !== 'all' && s.source !== filterSource) return false
    return true
  })

  const active = allSignals.filter(s => !s.resolved)
  const bySource = (Object.keys(SOURCE_LABEL) as SignalSource[]).map(src => ({
    src, count: active.filter(s => s.source === src).length
  })).filter(x => x.count > 0)

  return (
    <AppShell>
      <SectionHeader title="Senales" subtitle="Patrones, timing y contexto activo" />

      {/* Summary por fuente */}
      {bySource.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          {bySource.map(({ src, count }) => (
            <button key={src} onClick={() => setFilterSource(filterSource === src ? 'all' : src)}
              className={`flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded border transition-colors ${filterSource === src ? 'border-[#333] text-[#f5f5f5] bg-[#111]' : 'border-[#1a1a1a] text-[#333] hover:border-[#222]'}`}>
              <span>{SOURCE_LABEL[src]}</span>
              <span className="text-[#444]">({count})</span>
            </button>
          ))}
          {filterSource !== 'all' && (
            <button onClick={() => setFilterSource('all')} className="text-[10px] font-mono text-[#333] hover:text-[#555] px-2 py-1">x todas</button>
          )}
        </div>
      )}

      {/* Resumen del contexto */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Activas', value: String(ctx.activeSignals.filter(s => !s.resolved).length) },
          { label: 'Criticas', value: String(ctx.activeSignals.filter(s => s.urgency === 'immediate').length) },
          { label: 'Con accion', value: String(active.filter(s => s.actionRequired).length) },
          { label: 'Resueltas', value: String(allSignals.filter(s => s.resolved).length) },
        ].map((s) => (
          <Card key={s.label} className="flex flex-col gap-1">
            <div className="text-[9px] font-mono text-[#333] uppercase tracking-widest">{s.label}</div>
            <div className="text-2xl font-mono font-bold text-[#f5f5f5]">{s.value}</div>
          </Card>
        ))}
      </div>

      {/* Registrar senal manual */}
      <Card className="mb-4">
        <div className="text-[10px] font-mono text-[#333] uppercase tracking-widest mb-3">Registrar senal</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
          <Select value={source} onChange={e => setSource(e.target.value as SignalSource)}>
            {(Object.keys(SOURCE_LABEL) as SignalSource[]).map(s => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
          </Select>
          <Select value={type} onChange={e => setType(e.target.value as SignalType)}>
            {(Object.keys(TYPE_LABEL) as SignalType[]).map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </Select>
          <Select value={urgency} onChange={e => setUrgency(e.target.value as SignalUrgency)}>
            {(Object.keys(URGENCY_LABEL) as SignalUrgency[]).map(u => <option key={u} value={u}>{URGENCY_LABEL[u]}</option>)}
          </Select>
          <Input placeholder="Contenido de la senal" value={content} onChange={e => setContent(e.target.value)} className="col-span-2 md:col-span-3"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) submit() }} />
          <Input placeholder="Significado (opcional)" value={meaning} onChange={e => setMeaning(e.target.value)} className="col-span-1 md:col-span-2" />
          <Input placeholder="Accion sugerida (opcional)" value={action} onChange={e => setAction(e.target.value)} />
        </div>
        <Button onClick={submit}>+ Registrar senal</Button>
      </Card>

      {/* Toggle resueltas */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] font-mono text-[#333] uppercase tracking-widest">
          {filterSource !== 'all' ? SOURCE_LABEL[filterSource as SignalSource] : 'Todas las senales'} â {visible.length}
        </div>
        <button onClick={() => setShowResolved(!showResolved)} className="text-[10px] font-mono text-[#333] hover:text-[#555]">
          {showResolved ? 'Ocultar resueltas' : 'Mostrar resueltas'}
        </button>
      </div>

      {/* Lista */}
      {visible.length === 0 ? (
        <EmptyState message="Sin senales en este filtro." />
      ) : (
        <div className="space-y-2">
          {visible.map((s) => (
            <Card key={s.id} className={`${s.resolved ? 'opacity-40' : ''} border-[#1a1a1a]`}>
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge label={SOURCE_LABEL[s.source]} variant="muted" />
                    <Badge label={TYPE_LABEL[s.type]} variant="muted" />
                    <Badge label={URGENCY_LABEL[s.urgency]} variant={URGENCY_VARIANT[s.urgency]} />
                    {s.actionRequired && <Badge label="accion requerida" variant="warn" />}
                  </div>
                  <p className="text-xs text-[#f5f5f5] mb-1">{s.content}</p>
                  {s.meaning && s.meaning !== s.content && <p className="text-[11px] text-[#444]">{s.meaning}</p>}
                  {s.suggestedAction && <p className="text-[10px] text-[#333] mt-1">accion: {s.suggestedAction}</p>}
                  <p className="text-[9px] text-[#222] mt-1 font-mono">{new Date(s.detectedAt).toLocaleDateString('es')}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  {!s.resolved && <Button variant="ok" onClick={() => resolveSignal(s.id)}>Resolver</Button>}
                  <Button variant="danger" onClick={() => removeSignal(s.id)}>x</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  )
}
