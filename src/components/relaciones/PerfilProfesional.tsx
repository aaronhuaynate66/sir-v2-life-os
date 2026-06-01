'use client'
// SIR V2 — PerfilProfesional (#10 del detail page V1): sección colapsable
// con el perfil profesional COMPLETO escaneado de LinkedIn.
//
// Complementa a VidaProfesional (#6, que es el resumen at-a-glance): acá
// va el detalle largo (about sin recortar, experiencia/educación con
// rangos, flags, conexiones, link al perfil). Colapsado por defecto para
// no saturar la vista; se expande bajo demanda. Render determinístico de
// la observation linkedin más reciente — sin LLM.

import { useState } from 'react'
import { ChevronDown, Briefcase, ExternalLink, BadgeCheck, Image as ImageIcon } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { latestOfType, readLinkedIn, fmtCount } from '@/lib/observations/profile'
import { normalizeUrl } from '@/lib/social/links'
import { DiscardCaptureButton } from './DiscardCaptureButton'
import { cn } from '@/lib/utils'
import type { Observation } from '@/lib/capture/observations/types'
import type { Person } from '@/types'

export interface PerfilProfesionalProps {
  person: Person
  observations: Observation[]
}

const ABS_DATE = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric' })

export function PerfilProfesional({ person, observations }: PerfilProfesionalProps) {
  const obs = latestOfType(observations, 'linkedin')
  const [open, setOpen] = useState(false)

  // Si no hay captura de LinkedIn, no renderizamos la sección (VidaProfesional
  // #6 ya muestra su propio empty state con CTA — no duplicamos ruido).
  if (!obs) return null

  const li = readLinkedIn(obs.data)
  const profileUrl = normalizeUrl(person.linkedinUrl ?? null)

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2 group"
          aria-expanded={open}
        >
          <div className="flex items-center gap-2">
            <Briefcase size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
              Perfil profesional
            </div>
            <Badge variant="outline" className="text-[10px] font-mono">LinkedIn</Badge>
          </div>
          <ChevronDown
            size={16}
            strokeWidth={1.75}
            className={cn('text-muted-foreground/60 transition-transform group-hover:text-foreground', open && 'rotate-180')}
            aria-hidden="true"
          />
        </button>

        {open && (
          <div className="mt-4 space-y-4">
            {(li.fullName || li.headline) && (
              <div>
                {li.fullName && <div className="text-base font-semibold tracking-tight">{li.fullName}</div>}
                {li.headline && <div className="text-sm text-muted-foreground">{li.headline}</div>}
              </div>
            )}

            <div className="space-y-1.5 text-sm">
              {li.currentRole && <Row label="Cargo actual" value={li.currentRole} />}
              {li.currentCompany && <Row label="Empresa" value={li.currentCompany} />}
              {li.location && <Row label="Ubicación" value={li.location} />}
              {li.connectionsCount !== null && li.connectionsCount !== undefined && (
                <Row label="Conexiones" value={fmtCount(li.connectionsCount)} />
              )}
              {li.latestExperience?.name && (
                <Row
                  label="Última experiencia"
                  value={li.latestExperience.title ? `${li.latestExperience.title} · ${li.latestExperience.name}` : li.latestExperience.name}
                  hint={li.latestExperience.dateRange ?? undefined}
                />
              )}
              {li.latestEducation?.name && (
                <Row
                  label="Educación"
                  value={li.latestEducation.title ? `${li.latestEducation.title} · ${li.latestEducation.name}` : li.latestEducation.name}
                  hint={li.latestEducation.dateRange ?? undefined}
                />
              )}
            </div>

            {li.about && (
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mb-1">Acerca de</div>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{li.about}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              {li.isOpenToWork && (
                <Badge variant="outline" className="text-[10px] font-normal gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                  <BadgeCheck size={10} strokeWidth={2} aria-hidden="true" /> Open to work
                </Badge>
              )}
              {li.hasProfilePhoto && (
                <Badge variant="outline" className="text-[10px] font-normal gap-1">
                  <ImageIcon size={10} strokeWidth={2} aria-hidden="true" /> con foto
                </Badge>
              )}
              {li.hasBannerImage && (
                <Badge variant="outline" className="text-[10px] font-normal">banner</Badge>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-3">
              {profileUrl ? (
                <a
                  href={profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-sky-400 hover:underline inline-flex items-center gap-1"
                >
                  <ExternalLink size={11} strokeWidth={1.75} aria-hidden="true" />
                  Ver perfil en LinkedIn
                </a>
              ) : (
                <span className="text-[11px] text-muted-foreground/60 italic">
                  Sin URL de perfil — agregала en Redes sociales.
                </span>
              )}
              <span className="text-[10px] font-mono text-muted-foreground/50">
                escaneado {ABS_DATE.format(new Date(obs.observedAt))} · {obs.confidence ?? 's/conf'}
              </span>
            </div>

            {/* Descartar la captura si la extracción salió mal (baja resolución,
                datos garabateados). La saca de Vida profesional + Bitácora. */}
            <div className="flex justify-end">
              <DiscardCaptureButton observationId={obs.id} what="Perfil de LinkedIn" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex justify-between gap-3 py-1 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-right min-w-0">
        {value}
        {hint && <span className="block text-[10px] text-muted-foreground/60 font-mono">{hint}</span>}
      </span>
    </div>
  )
}
