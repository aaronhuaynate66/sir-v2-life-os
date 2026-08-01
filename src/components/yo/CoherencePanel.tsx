'use client'
// SIR V2 — "Coherencia declarado ↔ hecho" (E5, Life Direction). La SÍNTESIS a
// escala de vida: de todo lo que dices que te importa (tu norte + tus prioridades),
// ¿tu actividad real lo acompaña, o el grueso cae en otra parte? Y como tendencia:
// ¿convergés hacia tu norte o te alejas? Determinístico (computeLifeCoherence).
// No moraliza: repriorizar es una elección válida, no una incoherencia moral.
// Invisible sin data (insufficient → nada útil que mostrar acá).

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { Scale, ArrowRight, Sparkles, Loader2, X } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { SectionTitle } from '@/components/ui/section-title'
import { useGoalStore } from '@/stores/useGoalStore'
import { useObjectiveStepStore } from '@/stores/useObjectiveStepStore'
import { useSelfStore } from '@/stores/useSelfStore'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { computeLifeCoherence, coherenceSummaryLine, type CoherenceState } from '@/lib/self/coherence'

const STATE_META: Record<CoherenceState, { label: string; color: string }> = {
  coherent: { label: 'Coherente', color: '#2dd4a7' },
  mixed: { label: 'Foco repartido', color: '#e0a93b' },
  diverging: { label: 'Foco en otra parte', color: '#e0a93b' },
  insufficient: { label: 'Sin datos', color: '#8a8f98' },
}

type ReflState = { status: 'idle' | 'loading' | 'ready' | 'error'; text?: string }

export function CoherencePanel() {
  const hydrated = useHasHydrated()
  const goals = useGoalStore((s) => s.goals)
  const steps = useObjectiveStepStore((s) => s.steps)
  const coherence = useMemo(() => computeLifeCoherence(goals, steps), [goals, steps])

  const identityProfile = useSelfStore((s) => s.identityProfile)
  const identitySummary = useMemo(() => {
    const p = identityProfile
    if (!p) return null
    const parts: string[] = []
    if (p.roles && p.roles.length > 0) parts.push(p.roles.slice(0, 4).join(', '))
    if (p.bio && p.bio.trim()) parts.push(p.bio.trim().slice(0, 160))
    return parts.length > 0 ? parts.join(' · ') : null
  }, [identityProfile])

  const [refl, setRefl] = useState<ReflState>({ status: 'idle' })
  const generar = useCallback(async () => {
    const line = coherenceSummaryLine(coherence)
    if (!line) return
    setRefl({ status: 'loading' })
    try {
      const res = await fetch('/api/self/coherencia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coherence: line, anchor: coherence.anchorTitle, identity: identitySummary }),
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
  }, [coherence, identitySummary])

  if (!hydrated) return null
  // Invisible sin coherencia legible: sin prioridades declaradas o sin suficiente
  // actividad, esto no aporta (NorteDrift ya cubre el "fija tu norte").
  if (coherence.state === 'insufficient') return null

  const meta = STATE_META[coherence.state]
  const sharePct = coherence.recentShare === null ? null : Math.round(coherence.recentShare * 100)

  return (
    <Card style={{ borderColor: `${meta.color}55` }}>
      <CardContent className="p-4 sm:p-6">
        <SectionTitle icon={Scale} label="Coherencia declarado ↔ hecho" />
        <p className="mt-1 text-[13px] text-muted-foreground">
          De todo lo que dices que te importa, cuánto de tu actividad real lo acompaña —y hacia dónde viene yendo tu foco.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold"
            style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
          >
            {meta.label}
          </span>
          {sharePct !== null && (
            <span className="text-[12px] text-muted-foreground">
              {sharePct}% de tu actividad reciente sobre lo declarado
            </span>
          )}
        </div>

        <p className="mt-2 text-[14px] leading-relaxed text-foreground/90">{coherence.message}</p>

        {/* Barra: foco reciente sobre lo declarado. */}
        {sharePct !== null && (
          <div className="mt-3">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full" style={{ width: `${sharePct}%`, backgroundColor: meta.color }} />
            </div>
            <div className="mt-1 flex justify-between text-[11px] font-mono tabular-nums text-text-tertiary">
              <span>{coherence.recentDeclaredDone} sobre lo declarado</span>
              <span>{coherence.recentTotalDone} avances en {coherence.windowDays} días</span>
            </div>
          </div>
        )}

        {coherence.declaredIdle.length > 0 && (
          <div className="mt-3 border-t border-border pt-3 text-[12px] text-muted-foreground">
            <span className="text-[11px] uppercase tracking-wide">Declarado sin avance reciente</span>
            <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              {coherence.declaredIdle.slice(0, 4).map((d) => (
                <li key={d.id} className="text-foreground/80">
                  {d.isAnchor ? '★ ' : ''}
                  {d.title}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Reflexión IA opcional: reformula los números reales, no inventa. */}
        <div className="mt-4 border-t border-border/40 pt-4">
          {refl.status === 'ready' && refl.text ? (
            <div className="flex items-start gap-2.5">
              <Sparkles size={14} strokeWidth={1.75} className="mt-0.5 shrink-0 text-brand-soft-foreground" aria-hidden="true" />
              <p className="text-[13px] leading-relaxed text-foreground/90 break-words">{refl.text}</p>
              <button
                type="button"
                onClick={() => setRefl({ status: 'idle' })}
                className="shrink-0 text-muted-foreground/60 hover:text-foreground"
                aria-label="Descartar reflexión"
              >
                <X size={13} strokeWidth={1.75} />
              </button>
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
              {refl.status === 'loading' ? 'Leyendo tu coherencia…' : 'Generar una reflexión sobre tu coherencia'}
            </button>
          )}
          {refl.status === 'error' && refl.text && (
            <p className="mt-2 text-[12px] text-muted-foreground">{refl.text}</p>
          )}
        </div>

        <Link
          href="/objetivos"
          className="mt-4 inline-flex items-center gap-1 text-[13px] text-brand hover:underline"
        >
          Ver tus objetivos <ArrowRight size={13} />
        </Link>
      </CardContent>
    </Card>
  )
}
