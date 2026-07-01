'use client'

// SIR V2 — Cerebro F4 · <BrainGlow /> + F3 · Hebbian.
//
// Panel discreto en /horario (vista Día): "que esta encendido alrededor del
// proximo hito". Cada fila con arista directa al seed (reason != null) trae
// dos botones para APRENDIZAJE:
//   ↑ ThumbsUp  → confirma "me sirve" → refuerza el peso aprendido (F3).
//   ✕ X         → descarta "no me sirve" → debilita el peso aprendido.
// La fila desaparece localmente al aprender (optimistic UI). El delta se
// escribe en edge_weights (mig 0106).
//
// Diseño intencionado:
//  - NO empuja acciones. Propone lo activado con "por [tipo de conexion]".
//  - Cerrable por HOY (localStorage por dia, no permanente).
//  - Fail-silent: sin filas o sin sesion → no aparece.
//  - Sin doble-write: al aprender se remueve del state en el momento.

import { useCallback, useEffect, useState } from 'react'
import { Brain, ThumbsUp, X } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'

interface GlowRow {
  nodeKey: string
  type: string
  id: string
  label: string
  activation: number
  reason: string | null
  edgeKey: string | null
}

interface GlowResponse {
  seedNodeKey: string | null
  seedLabel: string | null
  rows: GlowRow[]
}

const REASON_LABEL: Record<string, string> = {
  family: 'familia',
  moment_participant: 'episodio',
  moment_reference: 'mencionado',
  goal_step: 'tarea del objetivo',
  deal_contact: 'deal · contacto',
  deal_client_org: 'deal · empresa',
  deal_related: 'deal · relacionado',
  memory_person: 'memoria',
  observation_person: 'captura',
  tracker_goal: 'tracker',
  tracker_step: 'tracker · tarea',
  money_person: 'plata',
  goal_cost: 'costo',
}

const TYPE_LABEL: Record<string, string> = {
  person: 'persona',
  goal: 'objetivo',
  org: 'empresa',
  moment: 'episodio',
  deal: 'deal',
  step: 'tarea',
  tracker: 'tracker',
}

function todayLimaIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function BrainGlow() {
  const [data, setData] = useState<GlowResponse | null>(null)
  const [dismissedToday, setDismissedToday] = useState(false)
  const [learning, setLearning] = useState<Set<string>>(new Set())

  useEffect(() => {
    const today = todayLimaIso()
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('brain-glow-dismissed')
      if (stored === today) {
        setDismissedToday(true)
        return
      }
    }
    let alive = true
    fetch('/api/brain/glow?limit=6', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: GlowResponse | null) => {
        if (alive && j) setData(j)
      })
      .catch(() => {
        /* fail-silent */
      })
    return () => {
      alive = false
    }
  }, [])

  const dismiss = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('brain-glow-dismissed', todayLimaIso())
    }
    setDismissedToday(true)
  }

  const submitFeedback = useCallback(
    async (edgeKey: string, action: 'reinforce' | 'discard') => {
      // Optimistic: sacamos la fila y bloqueamos el boton.
      setLearning((prev) => {
        const next = new Set(prev)
        next.add(edgeKey)
        return next
      })
      setData((prev) =>
        prev ? { ...prev, rows: prev.rows.filter((r) => r.edgeKey !== edgeKey) } : prev,
      )
      try {
        const res = await fetch('/api/brain/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ edgeKey, action }),
          cache: 'no-store',
        })
        if (!res.ok) {
          // Fail-silent en UI (ya se fue la fila); logueamos a consola por si
          // alguien mira. El proximo reload muestra la fila devuelta.
          // eslint-disable-next-line no-console
          console.warn('brain/feedback fallo', res.status)
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('brain/feedback error', err)
      }
    },
    [],
  )

  if (dismissedToday || !data || !data.rows || data.rows.length === 0) {
    return null
  }

  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <Brain size={12} strokeWidth={1.75} aria-hidden="true" />
            <span>
              Cerebro · encendido alrededor de{' '}
              <strong className="normal-case text-foreground">
                {data.seedLabel ?? 'tu norte'}
              </strong>
            </span>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Ocultar por hoy"
            className="text-muted-foreground hover:text-foreground"
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        </div>
        <ul className="space-y-1.5 text-sm">
          {data.rows.map((r) => {
            const canLearn = r.reason !== null && r.edgeKey !== null
            const isLearning = r.edgeKey ? learning.has(r.edgeKey) : false
            return (
              <li key={r.nodeKey} className="flex items-baseline justify-between gap-3">
                <div className="min-w-0 flex-1 truncate">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">
                    {TYPE_LABEL[r.type] ?? r.type}
                  </span>{' '}
                  <span className="text-foreground">{r.label}</span>
                </div>
                <div className="flex items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
                  <span>
                    {r.reason ? `por ${REASON_LABEL[r.reason] ?? r.reason}` : 'indirecto'}
                  </span>
                  {canLearn && (
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        disabled={isLearning}
                        onClick={() => submitFeedback(r.edgeKey as string, 'reinforce')}
                        aria-label="Me sirve — reforzar"
                        className="rounded p-1 text-muted-foreground hover:bg-foreground/5 hover:text-foreground disabled:opacity-40"
                      >
                        <ThumbsUp size={12} strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        disabled={isLearning}
                        onClick={() => submitFeedback(r.edgeKey as string, 'discard')}
                        aria-label="No me sirve — debilitar"
                        className="rounded p-1 text-muted-foreground hover:bg-foreground/5 hover:text-foreground disabled:opacity-40"
                      >
                        <X size={12} strokeWidth={1.75} />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
        <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
          Propuesta pasiva del cerebro. ↑ para reforzar el vínculo, ✕ para
          debilitarlo — el aprendizaje se refleja la próxima vez que carga.
        </p>
      </CardContent>
    </Card>
  )
}
