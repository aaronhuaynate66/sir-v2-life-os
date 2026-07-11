'use client'

// SIR V2 — "Lo que entró de tu gente" (superficie del feed inbound).
//
// La vista REACTIVA de la ingesta ambiental cross-canal: quién te escribió
// reciente, por qué canal, hace cuánto, el gist y si quedó en tu cancha. Espejo
// de "Hoy con tu gente" (DailyActionsPanel), que es PROACTIVO (a quién SALIR a
// buscar). Acá no proponemos: reflejamos lo que LLEGÓ, por recencia.
//
// Self-fetching: pide /api/panel/inbound al montar (motor puro, sin IA →
// instantáneo). Reusa los tokens/componentes existentes; no inventa paleta.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Inbox,
  MessageCircle,
  MessageSquare,
  Mail,
  Users,
  Hash,
  Briefcase,
  Camera,
  CornerUpLeft,
} from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { parseErrorResponse, toApiError, type ApiError } from '@/lib/api/errors'
import { relativeEs } from '@/lib/graph/hover'
import { cn } from '@/lib/utils'
import type { InboundChannelKey, InboundFeedItem } from '@/lib/panel/inboundFeed'

interface InboundResponse {
  items: InboundFeedItem[]
  generatedAt: string
}

const CHANNEL_ICON: Record<InboundChannelKey, typeof MessageCircle> = {
  whatsapp: MessageCircle,
  teams: Users,
  slack: Hash,
  email: Mail,
  linkedin: Briefcase,
  instagram: Camera,
  facebook: Users,
  dm: MessageSquare,
}

export interface InboundFeedPanelProps {
  /** Tope de filas pedido a la API (el server acota a 20). */
  limit?: number
  /** Encabezado. Default "Lo que entró de tu gente". */
  title?: string
  /** Oculta la card por completo cuando no hay nada (para /panel). Si es false,
   *  muestra el empty state pedagógico. */
  hideWhenEmpty?: boolean
}

export function InboundFeedPanel({
  limit,
  title = 'Lo que entró de tu gente',
  hideWhenEmpty = false,
}: InboundFeedPanelProps) {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'error'; error: ApiError }
    | { kind: 'ready'; data: InboundResponse }
  >({ kind: 'loading' })
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    let cancelled = false
    void (async () => {
      try {
        const qs = limit != null ? `?limit=${limit}` : ''
        const res = await fetch(`/api/panel/inbound${qs}`, { cache: 'no-store' })
        if (!res.ok) throw await parseErrorResponse(res)
        const data = (await res.json()) as InboundResponse
        if (!cancelled) setState({ kind: 'ready', data })
      } catch (e) {
        if (!cancelled) setState({ kind: 'error', error: toApiError(e) })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [limit])

  const items = state.kind === 'ready' ? state.data.items : []

  // En /panel la card se esconde si no entró nada (sólo tras fetch exitoso y
  // vacío; un error sí se muestra para no ocultar un fallo en silencio).
  if (hideWhenEmpty && state.kind === 'ready' && items.length === 0) return null

  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Inbox size={13} strokeWidth={1.75} className="text-text-tertiary" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">{title}</div>
          {state.kind === 'ready' && items.length > 0 && (
            <span className="ml-auto text-[11px] font-mono tabular-nums text-text-tertiary">{items.length}</span>
          )}
        </div>

        {state.kind === 'loading' && <PanelSkeleton />}

        {state.kind === 'error' && <ApiErrorNotice error={state.error} className="p-2" />}

        {state.kind === 'ready' &&
          (items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-1 leading-relaxed">
              Todavía no entró nada de tu gente. Cuando SIR lea conversaciones (WhatsApp, Teams, Correo o un
              chat pegado), acá vas a ver quién te escribió y qué podría estar esperándote. 🌿
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((it) => (
                <li key={`${it.personId}_${it.channelKey}`}>
                  <InboundRow item={it} now={now} />
                </li>
              ))}
            </ul>
          ))}
      </CardContent>
    </Card>
  )
}

function InboundRow({ item, now }: { item: InboundFeedItem; now: Date | null }) {
  const Icon = CHANNEL_ICON[item.channelKey] ?? MessageSquare
  const ago = now ? relativeEs(item.lastAt, now) : ''

  return (
    <div className="rounded-md border border-border bg-secondary/40 p-3">
      <div className="flex items-start gap-3">
        <Avatar name={item.personName} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {item.personSlug ? (
              <Link
                href={`/relaciones/${item.personSlug}`}
                className="font-medium text-sm text-foreground hover:underline underline-offset-2"
              >
                {item.personName}
              </Link>
            ) : (
              <span className="font-medium text-sm text-foreground">{item.personName}</span>
            )}
            <Badge variant="secondary" className="text-[10px] font-normal gap-1 px-2 py-0">
              <Icon size={10} strokeWidth={1.75} aria-hidden="true" />
              {item.channelLabel}
            </Badge>
            {item.entryCount > 1 && (
              <span className="text-[10px] text-text-tertiary font-mono tabular-nums">×{item.entryCount}</span>
            )}
            {ago && <span className="ml-auto text-[10px] text-text-tertiary">{ago}</span>}
          </div>

          {item.gist && <p className="text-xs text-foreground/90 mt-1 line-clamp-2">{item.gist}</p>}

          {item.awaitingReply && (
            <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-warn-foreground">
              <CornerUpLeft size={11} strokeWidth={1.75} aria-hidden="true" />
              <span>Quedó en tu cancha — el último mensaje fue suyo.</span>
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
