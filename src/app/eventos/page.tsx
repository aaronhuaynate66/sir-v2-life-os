'use client'

// SIR V2 — /eventos (18·M3): "Eventos que sigo".
//
// Señales externas por el camino manual y honesto: Aaron declara los eventos
// del afuera que le importan (el Mundial, una elección, un deadline de la red)
// con fecha + qué nodo tuyo tocan + impacto esperado. SIR los ordena por
// proximidad y los cruza con tu horizonte. Sin scraping, sin ruido, sin feed.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Radar, Plus, Trash2, Loader2, DollarSign, Target, Users, Heart, Globe2 } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import { todayLimaKey } from '@/lib/dates/limaDay'
import { classifyWatchedEvents, WATCHED_NODES, NODE_LABEL, type WatchedEvent, type WatchedNode, type Proximity } from '@/lib/external/watchedEvents'
import { cn } from '@/lib/utils'

const NODE_ICON: Record<WatchedNode, typeof Globe2> = {
  finanzas: DollarSign, objetivo: Target, persona: Users, salud: Heart, general: Globe2,
}
const PROX_TONE: Record<Proximity, string> = {
  passed: 'text-muted-foreground/60', today: 'text-bad', this_week: 'text-warn', this_month: 'text-foreground', later: 'text-muted-foreground',
}

export default function EventosPage() {
  const [events, setEvents] = useState<WatchedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [node, setNode] = useState<WatchedNode>('general')
  const [impact, setImpact] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch('/api/watched-events', { cache: 'no-store' })
      const j = (await r.json()) as { events?: WatchedEvent[]; error?: string }
      if (!r.ok) { setError(j.error ?? 'No pude cargar'); return }
      setEvents(j.events ?? [])
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const classified = useMemo(() => classifyWatchedEvents(events, todayLimaKey()), [events])

  async function add() {
    if (!title.trim() || !date) return
    setSaving(true); setError(null)
    try {
      const r = await fetch('/api/watched-events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, eventDate: date, node, impact }),
      })
      const j = (await r.json()) as { event?: WatchedEvent; error?: string }
      if (!r.ok || !j.event) { setError(j.error ?? 'No pude guardar'); return }
      setEvents((prev) => [...prev, j.event!])
      setTitle(''); setDate(''); setImpact(''); setNode('general')
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setSaving(false) }
  }

  async function remove(id: string) {
    setEvents((prev) => prev.filter((e) => e.id !== id))
    try { await fetch(`/api/watched-events?id=${encodeURIComponent(id)}`, { method: 'DELETE' }) } catch { void load() }
  }

  return (
    <AppShell>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Radar size={26} strokeWidth={1.5} className="text-muted-foreground" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Eventos que sigo</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed max-w-2xl">
          El afuera que te importa, en tus términos. Anotá un evento externo (el Mundial, una elección, un deadline)
          con su fecha, <span className="text-foreground/80">qué nodo tuyo toca</span> y el impacto — y SIR lo cruza
          con tu horizonte. Sin feed de noticias: vos elegís qué mundo mirar.
        </p>
      </div>

      <Card className="shadow-none mb-4">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Arranca el Mundial WFG26" aria-label="Evento" />
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Fecha" className="font-mono sm:w-44" />
          </div>
          <div className="grid gap-2 sm:grid-cols-[auto_1fr]">
            <Select value={node} onValueChange={(v) => setNode(v as WatchedNode)}>
              <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WATCHED_NODES.map((n) => <SelectItem key={n} value={n}>{NODE_LABEL[n]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input value={impact} onChange={(e) => setImpact(e.target.value)} placeholder="Impacto esperado (opcional): ej. gasto fuerte en USD" aria-label="Impacto" />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => void add()} disabled={!title.trim() || !date || saving}>
              {saving ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Plus size={14} className="mr-1.5" />}
              Seguir evento
            </Button>
          </div>
          {error && <p className="text-[12px] text-bad">{error}</p>}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 size={14} className="animate-spin" /> Cargando…</div>
      ) : classified.length === 0 ? (
        <EmptyState icon={Radar} size="sm" title="Sin eventos que seguir todavía." hint="Anotá el primero arriba — el Mundial, un pago grande, una fecha de la red." />
      ) : (
        <Card className="shadow-none">
          <CardContent className="p-4 sm:p-5">
            <ul className="divide-y divide-border/40">
              {classified.map((e) => {
                const Icon = NODE_ICON[e.node]
                return (
                  <li key={e.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <Icon size={15} strokeWidth={1.75} className="text-muted-foreground/70 mt-0.5 flex-shrink-0" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{e.title}</span>
                        <Badge variant="outline" className="text-[10px]">{NODE_LABEL[e.node]}</Badge>
                        <span className={cn('text-[11px] font-medium', PROX_TONE[e.proximity])}>{e.whenLabel}</span>
                        <span className="text-[11px] text-muted-foreground/60 font-mono">{e.eventDate}</span>
                      </div>
                      {e.impact && <p className="text-[12px] text-muted-foreground mt-0.5 leading-snug">{e.impact}</p>}
                    </div>
                    <button type="button" onClick={() => void remove(e.id)} className="text-muted-foreground/60 hover:text-bad p-1 flex-shrink-0" aria-label="Dejar de seguir">
                      <Trash2 size={13} strokeWidth={1.75} />
                    </button>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <p className="text-[11px] text-muted-foreground/70 leading-relaxed mt-4 px-1">
        Contexto, no alarma. Un evento externo suma solo cuando toca algo tuyo — por eso vos elegís cuáles seguir.
      </p>
    </AppShell>
  )
}
