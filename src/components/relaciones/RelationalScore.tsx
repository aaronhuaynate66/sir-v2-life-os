// SIR V2 — RelationalScore (port adaptado de SIR V1).
//
// V1 mostraba: numero grande (49) + 3 progress bars (Fuerza, Reciprocidad,
// Confianza) + "Ultimo contacto: 23 may 2026". Mapeo V1 -> V2 honrado, con
// el guardrail que pidio el prompt: NO fabricar dimensiones desde data que
// no existe.
//
// MAPEO DE DIMENSIONES:
//
//  - Fuerza (0-100): derivada de people.importance_score (1-10, scale x10)
//    con ajuste por recencia del ultimo whatsapp_chat:
//      * lastChat <14 dias  -> +10 (cap 100)
//      * lastChat 14-60 d   -> sin ajuste
//      * lastChat >60 d / null -> -10 (floor 0)
//    Baseline para persona recien creada (importance=5 default, sin chat):
//    50 - 10 = 40.
//
//  - Reciprocidad (0-100 | null): MIDE balance de mensajes user/other.
//    V1 lo calculaba desde un log dedicado de interacciones que V2 no tiene
//    todavia. Para inferirlo aca harian falta >=3 conversaciones
//    whatsapp_chat con rawMessages — y aun asi seria una muestra parcial.
//    GUARDRAIL: en PR-B mostramos "datos insuficientes" (null) en vez de
//    inventar un score. Cuando exista el log de reciprocidad (sesion
//    futura), este componente cae a calcular sin tocar la UI.
//
//  - Confianza (0-100): people.trust_level (1-10, scale x10). Sin ajuste.
//
// SCORE GLOBAL: promedio de las dimensiones NO-NULL (round). Casi siempre
// dos (Fuerza + Confianza); cuando Reciprocidad este disponible, tres.

import Link from 'next/link'
import { TrendingUp, Info } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import type { Observation } from '@/lib/capture/observations/types'
import type { Person } from '@/types'
import { cn } from '@/lib/utils'
import { parseLocalDate } from '@/lib/dates/parseLocalDate'

export interface RelationalScoreProps {
  person: Person
  /** Ultima observation con capture_type='whatsapp_chat' (curada). Se usa
   *  para el ajuste de recencia de Fuerza. null si no hay chat. */
  lastChat: Observation | null
}

interface ScoreBreakdown {
  fuerza: number
  reciprocidad: number | null
  confianza: number
  global: number
  /** Dias desde el ultimo whatsapp_chat (para el footer "Ultimo contacto:"). */
  daysSinceLastChat: number | null
}

const DAY_MS = 86_400_000

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function computeBreakdown(person: Person, lastChat: Observation | null): ScoreBreakdown {
  const importance = clamp(Number(person.importanceScore) || 5, 1, 10)
  const trust = clamp(Number(person.trustLevel) || 5, 1, 10)

  let daysSinceLastChat: number | null = null
  if (lastChat?.observedAt) {
    const t = new Date(lastChat.observedAt).getTime()
    if (!Number.isNaN(t) && t <= Date.now()) {
      daysSinceLastChat = Math.floor((Date.now() - t) / DAY_MS)
    }
  }

  // Fuerza con ajuste de recencia.
  let fuerza = importance * 10
  if (daysSinceLastChat === null) {
    fuerza -= 10
  } else if (daysSinceLastChat < 14) {
    fuerza += 10
  } else if (daysSinceLastChat > 60) {
    fuerza -= 10
  }
  fuerza = clamp(fuerza, 0, 100)

  // Reciprocidad: guardrail — V2 no tiene log de interacciones aun.
  const reciprocidad: number | null = null

  const confianza = trust * 10

  const known = [fuerza, confianza, ...(reciprocidad !== null ? [reciprocidad] : [])]
  const global = Math.round(known.reduce((a, b) => a + b, 0) / known.length)

  return { fuerza, reciprocidad, confianza, global, daysSinceLastChat }
}

export function RelationalScore({ person, lastChat }: RelationalScoreProps) {
  const breakdown = computeBreakdown(person, lastChat)

  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
            Score relacional
          </div>
        </div>

        <div className="flex items-baseline gap-2 mb-5">
          <span className="text-4xl font-semibold tracking-tight tabular-nums">
            {breakdown.global}
          </span>
          <span className="text-xs text-muted-foreground">/100</span>
        </div>

        <div className="space-y-3 mb-4">
          <ScoreBar label="Fuerza" value={breakdown.fuerza} color="emerald" />
          <ScoreBar
            label="Reciprocidad"
            value={breakdown.reciprocidad}
            color="amber"
            insufficientHint="Necesita un log de interacciones recíprocas (sesión futura)."
          />
          <ScoreBar label="Confianza" value={breakdown.confianza} color="sky" />
        </div>

        <FooterLine person={person} daysSinceLastChat={breakdown.daysSinceLastChat} />
      </CardContent>
    </Card>
  )
}

function ScoreBar({
  label,
  value,
  color,
  insufficientHint,
}: {
  label: string
  value: number | null
  color: 'emerald' | 'amber' | 'sky'
  insufficientHint?: string
}) {
  const insufficient = value === null
  const fillClass = insufficient
    ? 'bg-muted-foreground/30'
    : color === 'emerald'
    ? 'bg-emerald-500/70'
    : color === 'amber'
    ? 'bg-amber-500/70'
    : 'bg-sky-500/70'

  return (
    <div>
      <div className="flex items-baseline justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums text-foreground/80">
          {insufficient ? '—' : `${value}/100`}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full transition-all', fillClass)}
          style={{ width: insufficient ? '100%' : `${value}%`, opacity: insufficient ? 0.4 : 1 }}
        />
      </div>
      {insufficient && insufficientHint && (
        <div className="mt-1 flex items-start gap-1 text-[10px] text-muted-foreground/80">
          <Info size={10} strokeWidth={1.75} className="mt-[2px] shrink-0" aria-hidden="true" />
          <span>Datos insuficientes. {insufficientHint}</span>
        </div>
      )}
    </div>
  )
}

const ABS_FORMATTER = new Intl.DateTimeFormat('es', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

function FooterLine({
  person,
  daysSinceLastChat,
}: {
  person: Person
  daysSinceLastChat: number | null
}) {
  // Prioridad: si tenemos lastChat real, usamos esa fecha. Si no, caemos
  // a person.lastContact (manual). Si nada, mensaje de empty.
  if (daysSinceLastChat !== null) {
    return (
      <div className="text-[11px] text-muted-foreground border-t border-border/40 pt-3">
        Última conversación:{' '}
        <span className="text-foreground font-medium">
          hace {daysSinceLastChat === 0 ? 'menos de un día' : daysSinceLastChat === 1 ? '1 día' : `${daysSinceLastChat} días`}
        </span>
      </div>
    )
  }
  // lastContact es date-only (`YYYY-MM-DD`). Parsear como fecha LOCAL para
  // que NO retroceda un día en TZ con offset negativo (Lima UTC-5). Antes
  // usaba `new Date(str)` (medianoche UTC) → mostraba "29 may" para un
  // 2026-05-30, descuadrando contra Métricas (que muestra el ISO crudo).
  const lastContactDate = parseLocalDate(person.lastContact)
  if (lastContactDate) {
    return (
      <div className="text-[11px] text-muted-foreground border-t border-border/40 pt-3">
        Último contacto (manual):{' '}
        <span className="text-foreground font-medium font-mono">{ABS_FORMATTER.format(lastContactDate)}</span>
      </div>
    )
  }
  return (
    <div className="text-[11px] text-muted-foreground border-t border-border/40 pt-3">
      Sin contacto registrado.{' '}
      <Link href="/captura" className="underline underline-offset-2 hover:text-foreground">
        Subí una conversación
      </Link>{' '}
      o editá el último contacto desde la persona.
    </div>
  )
}
