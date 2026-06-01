// SIR V2 — VidaProfesional (#6 del detail page V1).
//
// Resumen profesional de la persona desde la observation `linkedin` más
// reciente (is_obsolete=false ya filtrado en la fetch layer). Render
// DETERMINÍSTICO de los campos que el extractor LinkedIn ya estructuró
// (currentRole, currentCompany, latestEducation, about, etc.) — sin LLM,
// sin alucinación, igual criterio que BirthdayCountdown / CicloPanel.
//
// Empty state honesto si la persona no tiene captura de LinkedIn: CTA a
// /captura para escanear un perfil.
//
// Patrón visual: Card + shadow-none + uppercase tracking-widest.

import { Briefcase, BadgeCheck, GraduationCap } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  latestOfType,
  readLinkedIn,
  professionalSummary,
  fmtCount,
} from '@/lib/observations/profile'
import type { Observation } from '@/lib/capture/observations/types'
import type { Person } from '@/types'

export interface VidaProfesionalProps {
  /** La persona (para `education`, campo people 0024). */
  person: Person
  /** Observations curadas de la persona (todas; filtramos linkedin acá). */
  observations: Observation[]
}

export function VidaProfesional({ person, observations }: VidaProfesionalProps) {
  const obs = latestOfType(observations, 'linkedin')
  const education = person.education?.trim()

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Briefcase
            size={14}
            strokeWidth={1.75}
            className="text-muted-foreground/70"
            aria-hidden="true"
          />
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
            Vida profesional
          </div>
        </div>

        {/* Educación / grado de instrucción (campo people, editable en Identidad). */}
        {education && (
          <div className="flex items-start gap-2 mb-3 pb-3 border-b border-border/40">
            <GraduationCap size={14} strokeWidth={1.75} className="text-muted-foreground/70 mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Educación</div>
              <div className="text-sm text-foreground">{education}</div>
            </div>
          </div>
        )}

        {obs ? <Body obs={obs} /> : education ? null : <EmptyState />}
      </CardContent>
    </Card>
  )
}

function Body({ obs }: { obs: Observation }) {
  const li = readLinkedIn(obs.data)
  const summary = professionalSummary(li)

  return (
    <div className="space-y-3">
      {summary ? (
        <p className="text-sm text-foreground leading-relaxed">{summary}</p>
      ) : (
        <p className="text-sm text-muted-foreground italic">
          Captura de LinkedIn sin campos legibles suficientes para un resumen.
        </p>
      )}

      <div className="space-y-1.5 text-sm">
        {li.headline && summary !== li.headline && (
          <Row label="Headline" value={li.headline} />
        )}
        {li.latestExperience?.name && (
          <Row
            label="Experiencia"
            value={
              li.latestExperience.title
                ? `${li.latestExperience.title} · ${li.latestExperience.name}`
                : li.latestExperience.name
            }
            hint={li.latestExperience.dateRange ?? undefined}
          />
        )}
        {li.latestEducation?.name && (
          <Row
            label="Educación"
            value={
              li.latestEducation.title
                ? `${li.latestEducation.title} · ${li.latestEducation.name}`
                : li.latestEducation.name
            }
            hint={li.latestEducation.dateRange ?? undefined}
          />
        )}
        {li.location && <Row label="Ubicación" value={li.location} />}
        {li.connectionsCount !== null && li.connectionsCount !== undefined && (
          <Row label="Conexiones" value={fmtCount(li.connectionsCount)} />
        )}
      </div>

      {li.about && (
        <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-border/40 pl-3 line-clamp-4">
          {li.about}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {li.isOpenToWork && (
          <Badge
            variant="outline"
            className="text-[10px] font-normal gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          >
            <BadgeCheck size={10} strokeWidth={2} aria-hidden="true" />
            Open to work
          </Badge>
        )}
        <span className="text-[10px] font-mono text-muted-foreground/50 ml-auto">
          linkedin · {obs.confidence ?? 'sin confianza'}
        </span>
      </div>
    </div>
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

function EmptyState() {
  return (
    <div className="text-sm text-muted-foreground space-y-1.5">
      <p>Sin captura de LinkedIn.</p>
      <p className="text-xs leading-relaxed">
        Subí un pantallazo del perfil con{' '}
        <span className="font-medium text-foreground">Agregar captura</span> (arriba) para poblar
        esta sección — se asocia directo a esta persona.
      </p>
    </div>
  )
}
