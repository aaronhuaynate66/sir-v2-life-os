'use client'

// SIR V2 — "Tu rumbo" (Narrative Intelligence, Capa 1: el espinazo).
//
// Muestra el hilo de hitos REALES de la trayectoria (buildLifeThread sobre los
// objetivos): qué te propusiste, qué lograste, qué pausaste, qué dejaste ir.
// Determinístico, calmo, honesto — no inventa. (Capa 2, futura: una pasada de
// IA que reformule este hilo en una reflexión, sin inventar.)

import { useCallback, useMemo, useState } from 'react'
import { Compass, Flag, Check, Pause, X, Sparkles, Loader2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { useGoalStore } from '@/stores/useGoalStore'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { buildLifeThread, type LifeMilestoneKind } from '@/lib/self/lifeThread'

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}`
}

const ICON: Record<LifeMilestoneKind, typeof Flag> = { set: Flag, done: Check, paused: Pause, let_go: X }
function dotColor(kind: LifeMilestoneKind): string {
  if (kind === 'done') return 'hsl(var(--success))'
  if (kind === 'let_go' || kind === 'paused') return 'hsl(var(--text-tertiary))'
  return 'hsl(var(--brand))'
}

export function LifeThreadPanel() {
  const hydrated = useHasHydrated()
  const goals = useGoalStore((s) => s.goals)
  const thread = useMemo(() => buildLifeThread(goals), [goals])
  const shown = thread.slice(0, 10)
  const [refl, setRefl] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; text?: string }>({ status: 'idle' })
  const generar = useCallback(async () => {
    setRefl({ status: 'loading' })
    try {
      const res = await fetch('/api/self/rumbo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestones: shown.map((m) => ({ label: m.label, date: m.date, kind: m.kind })) }),
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
  }, [shown])

  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-1">
          <Compass size={16} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Tu rumbo</div>
        </div>
        <p className="text-xs text-muted-foreground mb-4">Qué te propusiste y hacia dónde venís yendo, en el tiempo.</p>

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
