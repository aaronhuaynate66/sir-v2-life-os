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

'use client'

import Link from 'next/link'
import { Activity, Info } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import type { Observation } from '@/lib/capture/observations/types'
import type { Person } from '@/types'
import { cn } from '@/lib/utils'
import { parseLocalDate } from '@/lib/dates/parseLocalDate'
import { useMounted } from '@/hooks/useMounted'
import { computeRelationalScore, healthBand } from '@/lib/people/relationalScore'

export interface RelationalScoreProps {
  person: Person
  /** Ultima observation con capture_type='whatsapp_chat' (curada). Se usa
   *  para el ajuste de recencia de Fuerza. null si no hay chat. */
  lastChat: Observation | null
}

export function RelationalScore({ person, lastChat }: RelationalScoreProps) {
  // El score incorpora un ajuste por recencia del último chat (Date.now()),
  // así que el número/Fuerza/footer dependen de "ahora" → mount-safe.
  const mounted = useMounted()

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-5">
          <Activity size={13} strokeWidth={1.75} className="text-text-tertiary" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
            Salud del vínculo
          </div>
        </div>

        {mounted ? <ScoreContent person={person} lastChat={lastChat} /> : <ScorePlaceholder />}
      </CardContent>
    </Card>
  )
}

function ScoreContent({ person, lastChat }: RelationalScoreProps) {
  const breakdown = computeRelationalScore(
    {
      importanceScore: person.importanceScore,
      trustLevel: person.trustLevel,
      lastChatObservedAt: lastChat?.observedAt ?? null,
    },
    new Date(),
  )
  const band = healthBand(breakdown.global)

  return (
    <>
      <div className="flex items-center gap-5 mb-5">
        {/* Anillo limpio (conic-gradient): pista surface-2 + arco semántico. */}
        <div
          className="relative h-20 w-20 shrink-0 rounded-full"
          style={{
            background: `conic-gradient(${band.color} ${breakdown.global * 3.6}deg, hsl(var(--secondary)) 0deg)`,
          }}
          role="img"
          aria-label={`Salud del vínculo: ${breakdown.global} de 100 (${band.label})`}
        >
          <div className="absolute inset-[6px] rounded-full bg-card flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold tracking-tight tabular-nums leading-none">
              {breakdown.global}
            </span>
            <span className="text-[10px] text-text-tertiary mt-0.5">/100</span>
          </div>
        </div>
        <div className="min-w-0">
          <div
            className="text-sm font-medium"
            style={{ color: band.soft }}
          >
            {band.label}
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Promedio de las dimensiones con datos.
          </p>
        </div>
      </div>

      <div className="space-y-3 mb-4">
        <ScoreBar label="Fuerza" value={breakdown.fuerza} />
        <ScoreBar
          label="Reciprocidad"
          value={breakdown.reciprocidad}
          insufficientHint="Necesita un log de interacciones recíprocas (sesión futura)."
        />
        <ScoreBar label="Confianza" value={breakdown.confianza} />
      </div>

      <FooterLine person={person} daysSinceLastChat={breakdown.daysSinceLastChat} />
    </>
  )
}

/** Placeholder determinístico mientras se difiere el cómputo del score. */
function ScorePlaceholder() {
  return (
    <div aria-hidden="true">
      <div className="flex items-center gap-5 mb-5">
        <div className="h-20 w-20 rounded-full bg-secondary animate-pulse shrink-0" />
        <div className="h-4 w-24 rounded bg-secondary animate-pulse" />
      </div>
      <div className="space-y-3 mb-4">
        <div className="h-1.5 w-full rounded-full bg-secondary animate-pulse" />
        <div className="h-1.5 w-full rounded-full bg-secondary animate-pulse" />
        <div className="h-1.5 w-full rounded-full bg-secondary animate-pulse" />
      </div>
      <div className="h-3 w-40 rounded bg-secondary animate-pulse border-t border-border/40 pt-3" />
    </div>
  )
}

/** Barra fina: fill blanco translúcido (neutral); el color semántico vive
 *  en el anillo (estado global), no se repite por dimensión. */
function ScoreBar({
  label,
  value,
  insufficientHint,
}: {
  label: string
  value: number | null
  insufficientHint?: string
}) {
  const insufficient = value === null

  return (
    <div>
      <div className="flex items-baseline justify-between text-xs mb-1.5">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums text-foreground/80">
          {insufficient ? '—' : `${value}/100`}
        </span>
      </div>
      <div className="h-1 w-full rounded-full bg-secondary overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', insufficient ? 'bg-muted-foreground/30' : 'bg-foreground/55')}
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
