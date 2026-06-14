'use client'

// SIR V2 — "Tu rumbo" (Narrative Intelligence, Capa 1: el espinazo).
//
// Muestra el hilo de hitos REALES de la trayectoria (buildLifeThread sobre los
// objetivos): qué te propusiste, qué lograste, qué pausaste, qué dejaste ir.
// Determinístico, calmo, honesto — no inventa. (Capa 2, futura: una pasada de
// IA que reformule este hilo en una reflexión, sin inventar.)

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Compass, Flag, Check, Pause, X, Sparkles, Loader2, TrendingUp, TrendingDown, Star } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { useGoalStore } from '@/stores/useGoalStore'
import { useRelationshipStore } from '@/stores/useRelationshipStore'
import { useSelfStore } from '@/stores/useSelfStore'
import { useMemoryStore } from '@/stores'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { buildLifeThread, relationshipMilestones, memoryMilestones, mergeLifeThread, type LifeMilestoneKind, type LifeMilestone } from '@/lib/self/lifeThread'
import { buildBondEvolution } from '@/lib/people/bondEvolution'
import type { ScoreSnapshot } from '@/lib/people/scoreTrend'

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}`
}

const ICON: Record<LifeMilestoneKind, typeof Flag> = { set: Flag, done: Check, paused: Pause, let_go: X, bond_rise: TrendingUp, bond_drop: TrendingDown, event: Star }
function dotColor(kind: LifeMilestoneKind): string {
  if (kind === 'done' || kind === 'bond_rise') return 'hsl(var(--success))'
  if (kind === 'event') return 'hsl(var(--brand))'
  if (kind === 'let_go' || kind === 'paused' || kind === 'bond_drop') return 'hsl(var(--text-tertiary))'
  return 'hsl(var(--brand))'
}

export function LifeThreadPanel() {
  const hydrated = useHasHydrated()
  const goals = useGoalStore((s) => s.goals)
  const people = useRelationshipStore((s) => s.people)
  const [relMilestones, setRelMilestones] = useState<LifeMilestone[]>([])

  // Hitos relacionales (E5): quiebres del vínculo desde los snapshots de score.
  // Fetch best-effort; si falla o no hay, el hilo queda solo con objetivos.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/person-score/snapshot')
        if (!res.ok) return
        const data = (await res.json()) as { snapshots?: { personId: string; dateBucket: string; global: number }[] }
        const rows = data.snapshots ?? []
        if (rows.length === 0) return
        const nameById = new Map(people.map((p) => [p.id, p.name]))
        const byPerson = new Map<string, ScoreSnapshot[]>()
        for (const r of rows) {
          const arr = byPerson.get(r.personId) ?? []
          arr.push({ dateBucket: r.dateBucket, global: r.global })
          byPerson.set(r.personId, arr)
        }
        const now = new Date()
        const out: LifeMilestone[] = []
        for (const [pid, snaps] of byPerson) {
          const name = nameById.get(pid)
          if (!name) continue
          const evo = buildBondEvolution(snaps, now)
          out.push(...relationshipMilestones(name, evo.shifts))
        }
        if (!cancelled) setRelMilestones(out)
      } catch {
        /* fail-soft */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [people])

  const memories = useMemoryStore((s) => s.memories)
  const memMilestones = useMemo(() => memoryMilestones(memories), [memories])
  const thread = useMemo(
    () => mergeLifeThread(buildLifeThread(goals), relMilestones, memMilestones),
    [goals, relMilestones, memMilestones],
  )
  const shown = thread.slice(0, 10)
  const anchorText = useMemo(() => {
    const a = goals.find((g) => g.isAnchor)
    if (!a) return null
    const sub = (a.anchorSubtitle ?? '').trim()
    return `${a.title}${sub ? ` · ${sub}` : ''}`
  }, [goals])
  const identityProfile = useSelfStore((s) => s.identityProfile)
  const identitySummary = useMemo(() => {
    const p = identityProfile
    if (!p) return null
    const parts: string[] = []
    if (p.roles && p.roles.length > 0) parts.push(p.roles.slice(0, 4).join(', '))
    if (p.bio && p.bio.trim()) parts.push(p.bio.trim().slice(0, 160))
    return parts.length > 0 ? parts.join(' · ') : null
  }, [identityProfile])
  const [refl, setRefl] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; text?: string }>({ status: 'idle' })
  const generar = useCallback(async () => {
    setRefl({ status: 'loading' })
    try {
      const res = await fetch('/api/self/rumbo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestones: shown.map((m) => ({ label: m.label, date: m.date, kind: m.kind })), anchor: anchorText, identity: identitySummary }),
      })
      const data = (await res.json()) as { insight?: string; detail?: string; error?: string }
      if (!res.ok || !data.insight) {
        setRefl({ status: 'error', text: data.detail || data.error || 'No se pudo generar la reflexión.' })
        return
      }
      setRefl({ status: 'ready', text: data.insight })
    } catch {
      setRefl({ status: 'error', text: 'No se pudo generar la reflexión.' })
    }
  }, [shown, anchorText, identitySummary])

  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-1">
          <Compass size={16} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Tu rumbo</div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Qué te propusiste y hacia dónde venís yendo, en el tiempo.</p>
        {hydrated && anchorText && (
          <div className="mb-4 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.07em] text-brand-soft-foreground mb-0.5">Tu norte del año</div>
            <div className="text-[13px] text-foreground/90 break-words">{anchorText}</div>
          </div>
        )}

        {!hydrated ? null : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground py-1">
            Cuando pongas y muevas objetivos, acá se va a ir tejiendo tu hilo: lo que te propusiste, lograste o dejaste ir. 🧭
          </p>
        ) : (
          <ul className="space-y-3">
            {shown.map((m) => {
              const I = ICON[m.kind]
              return (
                <li key={m.id} className="flex items-start gap-3">
                  <span
                    className="mt-0.5 shrink-0 inline-flex items-center justify-center"
                    style={{ width: 20, height: 20, borderRadius: 999, background: 'hsl(var(--secondary))', color: dotColor(m.kind) }}
                    aria-hidden="true"
                  >
                    <I size={12} strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-foreground/90 break-words">{m.label}</div>
                    <div className="text-[11px] font-mono tabular-nums text-text-tertiary mt-0.5">{fmtDate(m.date)}</div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {hydrated && shown.length >= 2 && (
          <div className="mt-4 pt-4 border-t border-border/40">
            {refl.status === 'ready' && refl.text ? (
              <div className="flex items-start gap-2.5">
                <Sparkles size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-brand-soft-foreground" aria-hidden="true" />
                <p className="text-[13px] leading-relaxed text-foreground/90 break-words">{refl.text}</p>
              </div>
            ) : (
              <button
                type="button"
                onClick={generar}
                disabled={refl.status === 'loading'}
                className="inline-flex items-center gap-1.5 text-[13px] text-brand-soft-foreground hover:underline disabled:opacity-50"
              >
                {refl.status === 'loading' ? (
                  <Loader2 size={14} strokeWidth={1.75} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles size={14} strokeWidth={1.75} aria-hidden="true" />
                )}
                {refl.status === 'loading' ? 'Leyendo tu rumbo…' : 'Generar una reflexión sobre tu rumbo'}
              </button>
            )}
            {refl.status === 'error' && refl.text && (
              <p className="text-[12px] text-muted-foreground mt-2">{refl.text}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
