// SIR V2 — Propuesta EDITABLE de identidad (compartida).
//
// Vista de revisión que muestra lo que la auto-captura entendió (de pantallazos
// del perfil propio o de un relato) sobre el IdentityProfile. SIEMPRE editable
// antes de guardar y SUMA sin pisar lo manual (la fusión la hace
// buildCaptureProposal aguas arriba). La usan tanto el panel unificado "Mis
// capturas" como cualquier flujo de onboarding de identidad.
'use client'

import { useState } from 'react'
import {
  Check,
  X,
  Plus,
  Sparkles,
  Briefcase,
  MapPin,
  GraduationCap,
  FileText,
  IdCard,
  Cake,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import type { IdentityProfile } from '@/lib/identity'
import type { CaptureProposalDiff } from '@/lib/identity/applyCapture'

/** Origen de la propuesta (cambia el copy introductorio). */
export type IdentityProposalSource = 'image' | 'text'

const FILLED_LABEL: Record<CaptureProposalDiff['filled'][number]['field'], string> = {
  fullName: 'nombre',
  birthDate: 'nacimiento',
  location: 'ubicación',
  bio: 'bio',
  trajectory: 'trayectoria',
}

export interface IdentityProposalReviewProps {
  draft: IdentityProfile
  setDraft: (d: IdentityProfile) => void
  diff: CaptureProposalDiff | null
  source: IdentityProposalSource
  /** Cuántas fuentes se combinaron (pantallazos). */
  usedCount: number
  onSave: () => void
  onCancel: () => void
  /** Texto del botón de descartar/cancelar (default: "Descartar"). */
  cancelLabel?: string
}

export function IdentityProposalReview({
  draft,
  setDraft,
  diff,
  source,
  usedCount,
  onSave,
  onCancel,
  cancelLabel = 'Descartar',
}: IdentityProposalReviewProps) {
  const added =
    (diff?.addedRoles.length ?? 0) + (diff?.addedInterests.length ?? 0) + (diff?.filled.length ?? 0)
  const intro =
    source === 'text'
      ? 'Esto es lo que entendí de tu relato. '
      : usedCount > 1
        ? `Combiné ${usedCount} pantallazos. `
        : ''
  return (
    <div className="space-y-4 rounded-md border border-primary/20 bg-muted/10 p-3">
      <div className="flex items-center gap-2">
        <Sparkles size={14} strokeWidth={1.75} className="text-primary flex-shrink-0" aria-hidden="true" />
        <span className="text-xs font-medium text-foreground">Revisá lo que encontré</span>
      </div>
      <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
        {intro}
        {added > 0
          ? 'Esto SUMA a lo que ya tenías (no lo reemplaza). Corregí lo que haga falta antes de guardar.'
          : 'No encontré datos nuevos sobre lo que ya tenías. Podés ajustar igual.'}
      </p>

      {diff && (diff.addedRoles.length > 0 || diff.addedInterests.length > 0 || diff.filled.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {diff.addedRoles.map((r) => (
            <Badge key={`r-${r}`} variant="outline" className="text-[10px] font-normal border-ok/30 bg-ok-soft text-ok-foreground">
              + rol: {r}
            </Badge>
          ))}
          {diff.addedInterests.map((i) => (
            <Badge key={`i-${i}`} variant="outline" className="text-[10px] font-normal border-ok/30 bg-ok-soft text-ok-foreground">
              + {i}
            </Badge>
          ))}
          {diff.filled.map((f) => (
            <Badge key={`f-${f.field}`} variant="outline" className="text-[10px] font-normal border-brand/30 bg-brand-soft text-brand-soft-foreground">
              completa {FILLED_LABEL[f.field]}
            </Badge>
          ))}
        </div>
      )}

      <div className="space-y-3">
        <Field icon={IdCard} label="Nombre completo">
          <Input value={draft.fullName} placeholder="Tu nombre completo" onChange={(e) => setDraft({ ...draft, fullName: e.target.value })} />
        </Field>
        <Field icon={Cake} label="Fecha de nacimiento">
          <Input
            type="date"
            value={draft.birthDate ? draft.birthDate.slice(0, 10) : ''}
            onChange={(e) => setDraft({ ...draft, birthDate: e.target.value || null })}
            className="font-mono"
          />
        </Field>
        <Field icon={Briefcase} label="Roles / ocupación">
          <TagEditor items={draft.roles} placeholder="Agregar rol…" onChange={(roles) => setDraft({ ...draft, roles })} />
        </Field>
        <Field icon={Sparkles} label="Intereses / skills">
          <TagEditor items={draft.interests} placeholder="Agregar interés…" onChange={(interests) => setDraft({ ...draft, interests })} />
        </Field>
        <Field icon={MapPin} label="Ubicación">
          <Input value={draft.location} placeholder="Ej: Lima, Perú" onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
        </Field>
        <Field icon={GraduationCap} label="Trayectoria">
          <Textarea value={draft.trajectory} placeholder="Estudios + experiencia…" onChange={(e) => setDraft({ ...draft, trajectory: e.target.value })} className="min-h-[60px] resize-y" />
        </Field>
        <Field icon={FileText} label="Bio">
          <Textarea value={draft.bio} placeholder="Sobre vos…" onChange={(e) => setDraft({ ...draft, bio: e.target.value })} className="min-h-[60px] resize-y" />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
        <Button size="sm" variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
        <Button size="sm" onClick={onSave} className="inline-flex items-center gap-1.5">
          <Check size={14} strokeWidth={2} aria-hidden="true" />
          Guardar
        </Button>
      </div>
    </div>
  )
}

function Field({ icon: Icon, label, children }: { icon: typeof IdCard; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={13} strokeWidth={1.75} className="text-text-tertiary" aria-hidden="true" />
        <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">{label}</span>
      </div>
      {children}
    </div>
  )
}

/** Editor de tags compacto (agregar con Enter / botón, quitar con X). */
function TagEditor({
  items,
  placeholder,
  onChange,
}: {
  items: string[]
  placeholder: string
  onChange: (items: string[]) => void
}) {
  const [value, setValue] = useState('')
  function add() {
    const v = value.trim()
    if (!v) return
    if (items.some((it) => it.toLowerCase() === v.toLowerCase())) { setValue(''); return }
    onChange([...items, v])
    setValue('')
  }
  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((it, i) => (
            <span key={`${it}:${i}`} className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 pl-2 pr-1 py-1 text-xs text-foreground/90">
              {it}
              <button
                type="button"
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                className="ml-0.5 rounded-sm p-0.5 text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
                aria-label={`Quitar "${it}"`}
              >
                <X size={12} strokeWidth={2} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
        />
        <Button type="button" size="sm" variant="outline" onClick={add} className="flex-shrink-0" aria-label="Agregar">
          <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}
