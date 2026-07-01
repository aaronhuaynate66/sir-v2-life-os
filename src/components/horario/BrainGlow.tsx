'use client'

// SIR V2 — Cerebro F4 · <BrainGlow />
//
// Panel discreto en /horario (vista Día) que muestra "lo que esta encendido"
// alrededor de una semilla contextual (por default: el proximo hito del año).
// Consume /api/brain/glow — sin IA, sin cache: la data sale del grafo tipado.
//
// Diseno intencionado:
//  - NO empuja acciones. Propone lo activado con una razon corta ("por
//    familia" / "por deal · empresa cliente"). El usuario decide si le sirve.
//  - Cerrable: dismissed en localStorage por hoy (por dia, no permanente).
//  - Fail-silent: si el endpoint devuelve rows vacias, no aparece nada.
//  - No es un feed. Se recarga cuando el usuario recarga la pagina.

import { useEffect, useState } from 'react'
import { Brain, X } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'

interface GlowRow {
  nodeKey: string
  type: string
  id: string
  label: string
  activation: number
  reason: string | null
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
  // Aproximacion — el detalle de TZ vive en lib/horario/limaClock; aca
  // solo lo usamos como llave del "dismissed hoy".
  return new Date().toISOString().slice(0, 10)
}

export function BrainGlow() {
  const [data, setData] = useState<GlowResponse | null>(null)
  const [dismissedToday, setDismissedToday] = useState(false)

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
          {data.rows.map((r) => (
            <li key={r.nodeKey} className="flex items-baseline justify-between gap-3">
              <div className="min-w-0 flex-1 truncate">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  {TYPE_LABEL[r.type] ?? r.type}
                </span>{' '}
                <span className="text-foreground">{r.label}</span>
              </div>
              <div className="whitespace-nowrap text-xs text-muted-foreground">
                {r.reason ? `por ${REASON_LABEL[r.reason] ?? r.reason}` : 'indirecto'}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
          Propuesta pasiva del cerebro — no afirma estados ni empuja acciones.
          Se oculta por hoy con la X.
        </p>
      </CardContent>
    </Card>
  )
}
