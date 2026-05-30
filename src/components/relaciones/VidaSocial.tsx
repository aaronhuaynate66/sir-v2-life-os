// SIR V2 — VidaSocial (#7 del detail page V1).
//
// Stats de redes desde la observation `instagram` más reciente
// (is_obsolete=false ya filtrado en la fetch layer). Render
// DETERMINÍSTICO de los contadores que el extractor ya estructuró
// (posts / followers / following) + bio + badges — sin LLM.
//
// "Seguidores en común" (V1): NO hay fuente de datos para mutuals todavía
// (requiere cruzar dos perfiles del mismo grafo). Se omite honestamente,
// mismo criterio que la Reciprocidad "datos insuficientes" del
// RelationalScore — no inventamos un número.
//
// Empty state honesto si no hay captura de Instagram: CTA a /captura.

import Link from 'next/link'
import { AtSign, ExternalLink, BadgeCheck, Lock } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { latestOfType, readInstagram, fmtCount } from '@/lib/observations/profile'
import type { Observation } from '@/lib/capture/observations/types'

export interface VidaSocialProps {
  observations: Observation[]
}

export function VidaSocial({ observations }: VidaSocialProps) {
  const obs = latestOfType(observations, 'instagram')

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <AtSign
            size={14}
            strokeWidth={1.75}
            className="text-muted-foreground/70"
            aria-hidden="true"
          />
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
            Vida social
          </div>
        </div>

        {obs ? <Body obs={obs} /> : <EmptyState />}
      </CardContent>
    </Card>
  )
}

function Body({ obs }: { obs: Observation }) {
  const ig = readInstagram(obs.data)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {ig.handle && (
          <span className="text-sm font-medium font-mono text-foreground">@{ig.handle}</span>
        )}
        {ig.isVerified && (
          <Badge variant="outline" className="text-[10px] font-normal gap-1 border-sky-500/30 bg-sky-500/10 text-sky-400">
            <BadgeCheck size={10} strokeWidth={2} aria-hidden="true" />
            verificado
          </Badge>
        )}
        {ig.isPrivate && (
          <Badge variant="outline" className="text-[10px] font-normal gap-1">
            <Lock size={10} strokeWidth={2} aria-hidden="true" />
            privado
          </Badge>
        )}
        {ig.category && (
          <Badge variant="outline" className="text-[10px] font-normal">
            {ig.category}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Posts" value={fmtCount(ig.postsCount)} />
        <Stat label="Seguidores" value={fmtCount(ig.followersCount)} />
        <Stat label="Siguiendo" value={fmtCount(ig.followingCount)} />
      </div>

      {ig.bio && (
        <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-border/40 pl-3 whitespace-pre-wrap line-clamp-4">
          {ig.bio}
        </p>
      )}

      {ig.externalLink && (
        <a
          href={ig.externalLink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-sky-400 hover:underline inline-flex items-center gap-1 break-all"
        >
          <ExternalLink size={11} strokeWidth={1.75} aria-hidden="true" />
          {ig.externalLink}
        </a>
      )}

      {/* Seguidores en común: sin fuente de datos todavía (mutuals exige
          cruzar dos perfiles del grafo). Honestidad > número inventado. */}
      <div className="text-[11px] text-muted-foreground/70 border-t border-border/40 pt-2 flex items-center justify-between gap-2">
        <span>Seguidores en común: datos insuficientes</span>
        <span className="font-mono text-muted-foreground/50">
          instagram · {obs.confidence ?? 'sin confianza'}
        </span>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/40 px-2 py-2 text-center">
      <div className="text-base font-semibold tabular-nums tracking-tight">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{label}</div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="text-sm text-muted-foreground space-y-1.5">
      <p>Sin captura de Instagram.</p>
      <p className="text-xs leading-relaxed inline-flex items-center gap-1">
        Escaneá un perfil desde{' '}
        <Link
          href="/captura"
          className="underline underline-offset-2 hover:text-foreground inline-flex items-center gap-0.5"
        >
          Captura <ExternalLink size={11} strokeWidth={1.75} aria-hidden="true" />
        </Link>{' '}
        para poblar esta sección.
      </p>
    </div>
  )
}
