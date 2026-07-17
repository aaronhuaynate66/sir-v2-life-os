'use client'

// SIR V2 — /explorar (AF·F2): explorador de grafo.
//
// "Mostrame cómo se conecta todo esto." Elegís una semilla (una persona o un
// objetivo) y SIR difunde por el cerebro-grafo (F1-F4) y muestra qué se enciende
// y POR QUÉ, agrupado por tipo. Pathfinder apuntado a TU propia vida. Reusa
// /api/brain/glow (motor ya testeado) + el helper puro `lib/brain/explore`.

import { useEffect, useMemo, useState } from 'react'
import { Waypoints, Loader2, Users, Target, Building2, Sparkles, Handshake, CheckSquare, LineChart } from 'lucide-react'

import { AppShell } from '@/components/layout/AppShell'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import { useRelationshipStore } from '@/stores'
import { useGoalStore } from '@/stores/useGoalStore'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'
import { groupGlowRows, reasonLabel, type GlowGroup } from '@/lib/brain/explore'
import type { GlowRow } from '@/lib/brain/surface'
import type { NodeType } from '@/lib/brain/types'
import { cn } from '@/lib/utils'

const TYPE_ICON: Record<NodeType, typeof Users> = {
  person: Users, goal: Target, org: Building2, moment: Sparkles, deal: Handshake, step: CheckSquare, tracker: LineChart,
}

export default function ExplorarPage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={2} />
  return <ExplorarContent />
}

function ExplorarContent() {
  const people = useRelationshipStore((s) => s.people)
  const goals = useGoalStore((s) => s.goals)

  const [seed, setSeed] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<GlowRow[] | null>(null)
  const [seedLabel, setSeedLabel] = useState('')

  const sortedPeople = useMemo(() => [...people].sort((a, b) => (b.importanceScore ?? 0) - (a.importanceScore ?? 0) || a.name.localeCompare(b.name)), [people])
  const activeGoals = useMemo(() => goals.filter((g) => g.status === 'active'), [goals])

  useEffect(() => {
    if (!seed) { setRows(null); return }
    let alive = true
    setBusy(true); setError(null)
    void (async () => {
      try {
        const r = await fetch(`/api/brain/glow?seed=${encodeURIComponent(seed)}`, { cache: 'no-store' })
        const j = (await r.json()) as { rows?: GlowRow[]; seedLabel?: string | null; error?: string }
        if (!alive) return
        if (!r.ok) { setError(j.error ?? 'No pude explorar'); setRows([]); return }
        setRows(j.rows ?? [])
        setSeedLabel(j.seedLabel ?? '')
      } catch (e) { if (alive) { setError(e instanceof Error ? e.message : String(e)); setRows([]) } }
      finally { if (alive) setBusy(false) }
    })()
    return () => { alive = false }
  }, [seed])

  const groups: GlowGroup[] = useMemo(() => (rows ? groupGlowRows(rows) : []), [rows])
  const maxAct = useMemo(() => (rows && rows.length ? Math.max(...rows.map((r) => r.activation)) : 1), [rows])

  return (
    <AppShell>
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Waypoints size={26} strokeWidth={1.5} className="text-muted-foreground" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Explorar conexiones</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed max-w-2xl">
          Elige una persona o un objetivo y SIR te muestra <span className="text-foreground/80">cómo se conecta con el resto de tu vida</span> —
          quién y qué se enciende, y por qué. Sobre el cerebro-grafo que ya arma solo.
        </p>
      </div>

      <Card className="shadow-none mb-4">
        <CardContent className="p-4 sm:p-5">
          <label className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary font-sans block mb-1.5">Desde…</label>
          <Select value={seed} onValueChange={setSeed}>
            <SelectTrigger><SelectValue placeholder="Elige una persona u objetivo…" /></SelectTrigger>
            <SelectContent>
              {sortedPeople.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Personas</SelectLabel>
                  {sortedPeople.map((p) => <SelectItem key={p.id} value={`person:${p.id}`}>{p.name}</SelectItem>)}
                </SelectGroup>
              )}
              {activeGoals.length > 0 && (
                <SelectGroup>
                  <SelectLabel>Objetivos</SelectLabel>
                  {activeGoals.map((g) => <SelectItem key={g.id} value={`goal:${g.id}`}>{g.title}</SelectItem>)}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {busy && <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 size={14} className="animate-spin" /> Difundiendo por el grafo…</div>}
      {error && <p className="text-[12px] text-bad">{error}</p>}

      {rows && !busy && rows.length === 0 && !error && (
        <EmptyState icon={Waypoints} size="sm" title="Nada conectado todavía." hint="Este nodo aún no tiene vínculos en el grafo — carga interacciones, objetivos o vínculos y vuelve." />
      )}

      {seedLabel && rows && rows.length > 0 && (
        <p className="text-[11px] text-muted-foreground mb-3">Desde <span className="text-foreground font-medium">{seedLabel}</span> · {rows.length} conexiones</p>
      )}

      <div className="space-y-4">
        {groups.map((g) => {
          const Icon = TYPE_ICON[g.type]
          return (
            <Card key={g.type} className="shadow-none">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Icon size={13} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
                  <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">{g.label}</span>
                  <span className="text-[10px] text-muted-foreground/50 ml-auto">{g.rows.length}</span>
                </div>
                <ul className="space-y-2">
                  {g.rows.map((r) => (
                    <li key={r.nodeKey} className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] text-foreground truncate">{r.label}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{reasonLabel(r)}</div>
                      </div>
                      <div className="w-24 h-1.5 rounded-full bg-muted/40 overflow-hidden flex-shrink-0" title={`activación ${Math.round(r.activation)}`}>
                        <div className="h-full rounded-full bg-brand/60" style={{ width: `${Math.max(6, (r.activation / maxAct) * 100)}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {rows && rows.length > 0 && (
        <p className="text-[11px] text-muted-foreground/70 leading-relaxed mt-4 px-1">
          Es tu propio grafo, para verte — no vigilancia. La fuerza refleja cuánto conecta según lo que cargaste.
        </p>
      )}
    </AppShell>
  )
}
