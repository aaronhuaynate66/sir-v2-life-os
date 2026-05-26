'use client'
// SIR V2 — /signals
// Senales activas, manual, resolver, fuentes
import { useMemo, useState } from 'react'
import { Bell, Sparkles, Filter, AlertCircle, Clock, Eye, Archive, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SectionTitle } from '@/components/ui/section-title'
import { useSignalStore } from '@/stores/useSignalStore'
import { useMemoryStore } from '@/stores'
import { buildSignalContext } from '@/engines/signal'
import { createSignalAddedMemory } from '@/engines/memory'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'
import { cn } from '@/lib/utils'
import type { SignalSource, SignalType, SignalUrgency, Signal } from '@/types'

const SOURCE_LABEL: Record<SignalSource, string> = {
  linkedin: 'LinkedIn', instagram: 'Instagram', calendar: 'Calendario',
  biological: 'Biologico', financial: 'Financiero', relational: 'Relacional', manual: 'Manual',
}
const TYPE_LABEL: Record<SignalType, string> = {
  opportunity: 'Oportunidad', warning: 'Advertencia', pattern: 'Patron', timing: 'Timing',
  emotional: 'Emocional', relational: 'Relacional', biological: 'Biologico', financial: 'Financiero',
}
const URGENCY_LABEL: Record<SignalUrgency, string> = {
  immediate: 'Inmediata', soon: 'Pronto', monitor: 'Monitorear', archive: 'Archivar',
}
const URGENCY_CLASS: Record<SignalUrgency, string> = {
  immediate: 'border-red-500/30 bg-red-500/10 text-red-400',
  soon: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
  monitor: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  archive: 'border-border bg-muted text-muted-foreground/60',
}
const URGENCY_ICON: Record<SignalUrgency, LucideIcon> = {
  immediate: AlertCircle,
  soon: Clock,
  monitor: Eye,
  archive: Archive,
}

const cardClass = 'shadow-none transition-colors duration-200 hover:border-primary/30'

export default function SignalsPage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={4} />
  return <SignalsContent />
}

function SignalsContent() {
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
      resolved: false,
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
    src, count: active.filter(s => s.source === src).length,
  })).filter(x => x.count > 0)

  const stats = [
    { label: 'Activas', value: String(ctx.activeSignals.filter(s => !s.resolved).length) },
    { label: 'Criticas', value: String(ctx.activeSignals.filter(s => s.urgency === 'immediate').length) },
    { label: 'Con accion', value: String(active.filter(s => s.actionRequired).length) },
    { label: 'Resueltas', value: String(allSignals.filter(s => s.resolved).length) },
  ]

  return (
    <AppShell>
      <div className="mb-8">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-1">SIR V2</div>
        <div className="flex items-center gap-3 mt-1">
          <Bell size={28} strokeWidth={1.5} className="text-muted-foreground" />
          <h1 className="text-3xl font-semibold tracking-tight">Senales</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">Patrones, timing y contexto activo</p>
      </div>

      {bySource.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Filter size={12} strokeWidth={1.75} className="text-muted-foreground/60" />
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-sans">Por fuente</span>
          {bySource.map(({ src, count }) => (
            <button
              key={src}
              onClick={() => setFilterSource(filterSource === src ? 'all' : src)}
              className={cn(
                'flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1 rounded border transition-colors',
                filterSource === src
                  ? 'border-primary/40 text-primary bg-primary/10'
                  : 'border-border text-muted-foreground hover:border-foreground/20',
              )}
            >
              <span>{SOURCE_LABEL[src]}</span>
              <span className="text-muted-foreground/60">({count})</span>
            </button>
          ))}
          {filterSource !== 'all' && (
            <button onClick={() => setFilterSource('all')} className="text-[10px] font-mono text-muted-foreground hover:text-foreground px-2 py-1">
              × todas
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {stats.map((s) => (
          <Card key={s.label} className={cardClass}>
            <CardContent className="p-4">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">{s.label}</div>
              <div className="text-2xl font-mono font-bold tabular-nums text-foreground">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className={cn('mb-4', cardClass)}>
        <CardContent className="p-6">
          <SectionTitle icon={Sparkles} label="Registrar senal" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
            <Select value={source} onValueChange={(v) => setSource(v as SignalSource)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(SOURCE_LABEL) as SignalSource[]).map(s => <SelectItem key={s} value={s}>{SOURCE_LABEL[s]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={type} onValueChange={(v) => setType(v as SignalType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_LABEL) as SignalType[]).map(t => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={urgency} onValueChange={(v) => setUrgency(v as SignalUrgency)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(URGENCY_LABEL) as SignalUrgency[]).map(u => <SelectItem key={u} value={u}>{URGENCY_LABEL[u]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              placeholder="Contenido de la senal"
              value={content}
              onChange={e => setContent(e.target.value)}
              className="col-span-2 md:col-span-3"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) submit() }}
            />
            <Input placeholder="Significado (opcional)" value={meaning} onChange={e => setMeaning(e.target.value)} className="col-span-1 md:col-span-2" />
            <Input placeholder="Accion sugerida (opcional)" value={action} onChange={e => setAction(e.target.value)} />
          </div>
          <Button onClick={submit} variant="outline" size="sm">+ Registrar senal</Button>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
          {filterSource !== 'all' ? SOURCE_LABEL[filterSource as SignalSource] : 'Todas las senales'} &mdash; {visible.length}
        </div>
        <button onClick={() => setShowResolved(!showResolved)} className="text-[10px] font-mono text-muted-foreground hover:text-foreground">
          {showResolved ? 'Ocultar resueltas' : 'Mostrar resueltas'}
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-12">
          <Bell size={24} strokeWidth={1.5} className="text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Sin senales en este filtro.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Registra una senal arriba o ajusta los filtros.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((s) => {
            const UrgencyIcon = URGENCY_ICON[s.urgency]
            return (
              <Card key={s.id} className={cn(cardClass, s.resolved && 'opacity-40')}>
                <CardContent className="p-6">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <UrgencyIcon
                          size={14}
                          strokeWidth={1.75}
                          className={cn(
                            'flex-shrink-0',
                            s.urgency === 'immediate' ? 'text-red-400'
                              : s.urgency === 'soon' ? 'text-amber-400'
                              : s.urgency === 'monitor' ? 'text-blue-400'
                              : 'text-muted-foreground/60',
                          )}
                        />
                        <Badge variant="outline" className="text-[10px] font-normal">{SOURCE_LABEL[s.source]}</Badge>
                        <Badge variant="outline" className="text-[10px] font-normal">{TYPE_LABEL[s.type]}</Badge>
                        <Badge variant="outline" className={cn('text-[10px] font-normal', URGENCY_CLASS[s.urgency])}>{URGENCY_LABEL[s.urgency]}</Badge>
                        {s.actionRequired && <Badge variant="outline" className="text-[10px] font-normal border-amber-500/30 bg-amber-500/10 text-amber-400">accion requerida</Badge>}
                      </div>
                      <p className="text-sm text-foreground mb-1">{s.content}</p>
                      {s.meaning && s.meaning !== s.content && <p className="text-xs text-muted-foreground">{s.meaning}</p>}
                      {s.suggestedAction && <p className="text-[11px] text-muted-foreground/70 mt-1">accion: {s.suggestedAction}</p>}
                      <p className="text-[10px] text-muted-foreground/60 mt-1 font-mono tabular-nums">{new Date(s.detectedAt).toLocaleDateString('es')}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {!s.resolved && (
                        <Button variant="outline" size="sm" onClick={() => resolveSignal(s.id)} className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-400">
                          Resolver
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => removeSignal(s.id)} className="hover:text-red-400" aria-label="Eliminar">
                        <X size={14} strokeWidth={1.75} />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </AppShell>
  )
}
