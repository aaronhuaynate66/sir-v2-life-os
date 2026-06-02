'use client'

// SIR V2 — "Hoy con tu gente" (GEMA A+B, superficie).
//
// La capa accionable: cruza el score relacional, la recencia de contacto, las
// fechas de la red y tu disponibilidad para decir QUÉ HACER HOY con QUIÉN — y,
// a pedido, te da el MENSAJE listo para copiar y enviar (un Haiku por persona,
// on-demand, sin bloquear la vista). Se monta en /horario (Día) y /relaciones.
//
// Self-fetching: pide /api/daily-actions al montar (scoring instantáneo, sin
// IA). El mensaje copiable se genera sólo cuando lo pedís (/message).

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Sparkles,
  Cake,
  CalendarHeart,
  Snowflake,
  Send,
  MessageCircle,
  Copy,
  Check,
  Loader2,
  ArrowRight,
  BatteryLow,
} from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar } from '@/components/ui/avatar'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { parseErrorResponse, postJson, toApiError, type ApiError } from '@/lib/api/errors'
import { cn } from '@/lib/utils'
import type { DailyAction, DailyActionKind } from '@/lib/daily-actions/build'
import type { MessageSuggestion } from '@/lib/daily-actions/messagePrompt'

interface DailyActionsResponse {
  actions: DailyAction[]
  availability: number | null
  generatedAt: string
}

const KIND_META: Record<DailyActionKind, { Icon: typeof Sparkles; label: string }> = {
  contact: { Icon: Send, label: 'Contacto' },
  birthday: { Icon: Cake, label: 'Cumpleaños' },
  special_date: { Icon: CalendarHeart, label: 'Fecha' },
  cooling: { Icon: Snowflake, label: 'Enfriándose' },
  acknowledge: { Icon: Sparkles, label: 'Reconocer' },
}

const URGENCY_BADGE: Record<DailyAction['urgency'], { variant: 'bad' | 'warn' | 'secondary'; label: string }> = {
  high: { variant: 'bad', label: 'Urgente' },
  medium: { variant: 'warn', label: 'Pronto' },
  low: { variant: 'secondary', label: 'Cuando puedas' },
}

type MsgState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; suggestion: MessageSuggestion }
  | { status: 'error'; error: ApiError }

export interface DailyActionsPanelProps {
  /** 'compact' achica paddings/labels para la lista de /relaciones. */
  variant?: 'full' | 'compact'
}

export function DailyActionsPanel({ variant = 'full' }: DailyActionsPanelProps) {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'error'; error: ApiError }
    | { kind: 'ready'; data: DailyActionsResponse }
  >({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/daily-actions', { cache: 'no-store' })
        if (!res.ok) throw await parseErrorResponse(res)
        const data = (await res.json()) as DailyActionsResponse
        if (!cancelled) setState({ kind: 'ready', data })
      } catch (e) {
        if (!cancelled) setState({ kind: 'error', error: toApiError(e) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Card className="shadow-none">
      <CardContent className={cn(variant === 'compact' ? 'p-4' : 'p-4 sm:p-5')}>
        <div className="flex items-center gap-2 mb-3">
          <MessageCircle size={13} strokeWidth={1.75} className="text-text-tertiary" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Hoy con tu gente</div>
          {state.kind === 'ready' && state.data.actions.length > 0 && (
            <span className="ml-auto text-[11px] font-mono tabular-nums text-text-tertiary">
              {state.data.actions.length}
            </span>
          )}
        </div>

        {state.kind === 'loading' && <PanelSkeleton />}

        {state.kind === 'error' && <ApiErrorNotice error={state.error} className="p-2" />}

        {state.kind === 'ready' && (
          <>
            {state.data.availability !== null && state.data.availability < 35 && (
              <div className="mb-3 flex items-start gap-1.5 rounded-md border border-warn/25 bg-warn-soft px-2.5 py-2 text-[11px] text-warn-foreground">
                <BatteryLow size={12} strokeWidth={1.75} className="mt-[1px] shrink-0" aria-hidden="true" />
                <span>Tu energía está baja hoy — priorizamos menos contactos proactivos.</span>
              </div>
            )}

            {state.data.actions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-1">Tu red está al día. Nada urgente hoy. 🌿</p>
            ) : (
              <ul className="space-y-2">
                {state.data.actions.map((a) => (
                  <li key={`${a.personId}_${a.kind}`}>
                    <ActionRow action={a} variant={variant} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function ActionRow({ action, variant }: { action: DailyAction; variant: 'full' | 'compact' }) {
  const [msg, setMsg] = useState<MsgState>({ status: 'idle' })
  const [copied, setCopied] = useState(false)

  const meta = KIND_META[action.kind]
  const urg = URGENCY_BADGE[action.urgency]

  const generate = useCallback(async () => {
    setMsg({ status: 'loading' })
    try {
      const { suggestion } = await postJson<{ suggestion: MessageSuggestion }>('/api/daily-actions/message', {
        personId: action.personId,
        kind: action.kind,
        reason: action.headline,
        daysSinceContact: action.daysSinceContact,
        daysUntil: action.daysUntil ?? null,
      })
      setMsg({ status: 'ready', suggestion })
    } catch (e) {
      setMsg({ status: 'error', error: toApiError(e) })
    }
  }, [action])

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Mensaje copiado', { description: 'Pegalo donde quieras enviarlo.' })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('No pude copiar', { description: 'Copialo manualmente.' })
    }
  }, [])

  return (
    <div className="rounded-md border border-border bg-secondary/40 p-3">
      <div className="flex items-start gap-3">
        <Avatar name={action.personName} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {action.personSlug ? (
              <Link
                href={`/relaciones/${action.personSlug}`}
                className="font-medium text-sm text-foreground hover:underline underline-offset-2"
              >
                {action.personName}
              </Link>
            ) : (
              <span className="font-medium text-sm text-foreground">{action.personName}</span>
            )}
            <span className="inline-flex items-center gap-1 text-[10px] text-text-tertiary">
              <meta.Icon size={11} strokeWidth={1.75} aria-hidden="true" />
              {meta.label}
            </span>
            <Badge variant={urg.variant} className="text-[10px] font-normal ml-auto">
              {urg.label}
            </Badge>
          </div>

          <p className="text-xs text-foreground/90 mt-1">{action.headline}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">→ {action.action}</p>

          {variant === 'full' && (
            <div className="mt-1.5 flex items-center gap-3 text-[10px] font-mono tabular-nums text-text-tertiary">
              <span>Fuerza {action.fuerza}</span>
              <span>Recip. {action.reciprocidad === null ? '—' : action.reciprocidad}</span>
            </div>
          )}

          {/* Mensaje copiable on-demand */}
          {msg.status === 'idle' && (
            <Button
              variant="outline"
              size="sm"
              onClick={generate}
              className="mt-2 h-7 text-[11px] border-brand/30 bg-brand-soft text-brand-soft-foreground hover:bg-brand/20"
            >
              <Sparkles size={11} strokeWidth={1.75} className="mr-1" />
              Generar mensaje
            </Button>
          )}

          {msg.status === 'loading' && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
              Escribiendo un mensaje para {action.personName.split(' ')[0]}…
            </div>
          )}

          {msg.status === 'error' && (
            <div className="mt-2">
              <ApiErrorNotice error={msg.error} className="p-2" />
              <Button variant="ghost" size="sm" onClick={generate} className="mt-1 h-7 text-[11px]">
                Reintentar
              </Button>
            </div>
          )}

          {msg.status === 'ready' && (
            <div className="mt-2 rounded-md border border-border bg-card p-2.5">
              <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                {msg.suggestion.message_suggestion}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copy(msg.suggestion.message_suggestion)}
                  className="h-7 text-[11px]"
                >
                  {copied ? (
                    <>
                      <Check size={11} strokeWidth={2} className="mr-1 text-ok" /> Copiado
                    </>
                  ) : (
                    <>
                      <Copy size={11} strokeWidth={1.75} className="mr-1" /> Copiar
                    </>
                  )}
                </Button>
                {action.personSlug && (
                  <Button variant="ghost" size="sm" asChild className="h-7 text-[11px] text-muted-foreground">
                    <Link href={`/relaciones/${action.personSlug}`}>
                      Ver ficha <ArrowRight size={11} strokeWidth={1.75} className="ml-1" />
                    </Link>
                  </Button>
                )}
              </div>
              {msg.suggestion.impact_prediction && (
                <p className="mt-1.5 text-[10px] text-text-tertiary">{msg.suggestion.impact_prediction}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PanelSkeleton() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-md border border-border bg-secondary/40 p-3 flex items-start gap-3">
          <div className="h-8 w-8 rounded-full bg-secondary animate-pulse shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-32 rounded bg-secondary animate-pulse" />
            <div className="h-3 w-48 rounded bg-secondary animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}
