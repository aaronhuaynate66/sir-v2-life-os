// SIR V2 — Anclas de identidad (sección "Yo" / perfil propio).
//
// Datos básicos de identidad de Aaron, base del motor proactivo: nombre
// completo, fecha de nacimiento (→ edad calculada en TZ Lima), roles/ocupación
// (multi-tag), ubicación, y sus propias fechas importantes recurrentes.
//
// Patrón de edición: vista de lectura ↔ modo edición con draft local; "Guardar"
// normaliza y hace UN solo upsert (setIdentityProfile → sync a Supabase). Las
// fechas importantes se editan inline (add/remove) vía updateIdentityProfile,
// reusando el mismo patrón y utilidades que las fechas de una persona.
//
// Persiste en identity_profile (singleton por usuario, RLS, Realtime — ver
// useSelfStore + adapters/self.ts + migration 0055).
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  IdCard,
  Pencil,
  Plus,
  X,
  Check,
  Cake,
  Briefcase,
  MapPin,
  CalendarHeart,
  Repeat,
  AlertCircle,
  Sparkles,
  GraduationCap,
  FileText,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { SelfProfileCapture } from '@/components/yo/SelfProfileCapture'
import { useSelfStore } from '@/stores/useSelfStore'
import { useMounted } from '@/hooks/useMounted'
import {
  emptyIdentityProfile,
  isIdentityEmpty,
  normalizeIdentityProfile,
  computeAge,
  type IdentityProfile,
} from '@/lib/identity'
import { parseLocalDate } from '@/lib/dates/parseLocalDate'
import {
  sortSpecialDates,
  formatSpecialDate,
  formatCountdownPhrase,
  inferAnnualRecurrence,
  type SpecialDateCountdown,
} from '@/lib/dates/specialDates'
import type { SpecialDate } from '@/types'
import { cn } from '@/lib/utils'

const BIRTH_FORMATTER = new Intl.DateTimeFormat('es', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
})

export function IdentityProfilePanel() {
  const profile = useSelfStore((s) => s.identityProfile)
  const setIdentityProfile = useSelfStore((s) => s.setIdentityProfile)

  const [editing, setEditing] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [draft, setDraft] = useState<IdentityProfile | null>(null)

  function startEdit() {
    setDraft(profile ? { ...profile } : emptyIdentityProfile('idn_' + Date.now()))
    setEditing(true)
  }
  function cancelEdit() {
    setDraft(null)
    setEditing(false)
  }
  function save() {
    if (!draft) return
    if (draft.birthDate && !parseLocalDate(draft.birthDate)) {
      toast.error('Fecha de nacimiento inválida', { description: 'Elegí una fecha válida o dejala vacía.' })
      return
    }
    const clean = normalizeIdentityProfile({ ...draft, updatedAt: new Date().toISOString() })
    setIdentityProfile(clean)
    setDraft(null)
    setEditing(false)
    toast.success('Identidad guardada', { description: 'Tus anclas quedaron actualizadas.' })
  }

  const empty = isIdentityEmpty(profile)

  return (
    <Card className="mb-6 border-primary/20 shadow-none transition-colors duration-200">
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <IdCard size={16} strokeWidth={1.75} className="text-primary flex-shrink-0" aria-hidden="true" />
              <h2 className="text-base sm:text-lg font-semibold tracking-tight">Identidad</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-1 leading-snug">
              Tus anclas: quién sos, desde cuándo y dónde. Base de los recordatorios y el motor proactivo.
            </p>
          </div>
          {!editing && !capturing && (
            <div className="flex flex-shrink-0 items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCapturing(true)}
                className="inline-flex items-center gap-1.5"
              >
                <Sparkles size={13} strokeWidth={1.75} aria-hidden="true" />
                Que SIR me conozca
              </Button>
              <Button size="sm" variant="outline" onClick={startEdit} className="inline-flex items-center gap-1.5">
                <Pencil size={13} strokeWidth={1.75} aria-hidden="true" />
                {empty ? 'Completar' : 'Editar'}
              </Button>
            </div>
          )}
        </div>

        {capturing ? (
          <SelfProfileCapture onClose={() => setCapturing(false)} />
        ) : editing && draft ? (
          <EditView draft={draft} setDraft={setDraft} onSave={save} onCancel={cancelEdit} />
        ) : empty ? (
          <EmptyState onStart={startEdit} />
        ) : (
          <ReadView profile={profile!} />
        )}

        {/* Mis fechas importantes propias — siempre disponibles (no dependen
            del modo edición de las anclas). */}
        <MisFechasImportantes />
      </CardContent>
    </Card>
  )
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="text-center py-8">
      <IdCard size={26} strokeWidth={1.5} className="text-primary/40 mx-auto mb-3" aria-hidden="true" />
      <p className="text-sm text-foreground/80">Definí tus anclas de identidad.</p>
      <p className="text-xs text-muted-foreground/70 mt-1 max-w-md mx-auto leading-snug">
        Nombre completo, fecha de nacimiento, tus roles (bombero, fundador, atleta…) y dónde vivís.
      </p>
      <Button size="sm" onClick={onStart} className="mt-4 inline-flex items-center gap-1.5">
        <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
        Completar identidad
      </Button>
    </div>
  )
}

function ReadView({ profile }: { profile: IdentityProfile }) {
  // La edad depende de "hoy" → se computa solo tras montar (mount-safe).
  const mounted = useMounted()
  const age = mounted ? computeAge(profile.birthDate) : null
  const birth = profile.birthDate ? parseLocalDate(profile.birthDate) : null

  return (
    <div className="space-y-4">
      {profile.fullName && (
        <div>
          <FieldLabel icon={IdCard} label="Nombre completo" />
          <p className="text-lg font-semibold tracking-tight">{profile.fullName}</p>
        </div>
      )}

      {profile.birthDate && (
        <div>
          <FieldLabel icon={Cake} label="Nacimiento" />
          <p className="text-sm text-foreground/90">
            {birth ? BIRTH_FORMATTER.format(birth) : profile.birthDate}
            {age !== null && (
              <span className="text-muted-foreground"> · {age} año{age === 1 ? '' : 's'}</span>
            )}
          </p>
        </div>
      )}

      {profile.roles.length > 0 && (
        <div>
          <FieldLabel icon={Briefcase} label="Roles / ocupación" />
          <div className="flex flex-wrap gap-1.5">
            {profile.roles.map((r) => (
              <Badge key={r} variant="outline" className="font-normal">
                {r}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {profile.location && (
        <div>
          <FieldLabel icon={MapPin} label="Ubicación" />
          <p className="text-sm text-foreground/90">{profile.location}</p>
        </div>
      )}

      {profile.interests.length > 0 && (
        <div>
          <FieldLabel icon={Sparkles} label="Intereses / skills" />
          <div className="flex flex-wrap gap-1.5">
            {profile.interests.map((i) => (
              <Badge key={i} variant="outline" className="font-normal">
                {i}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {profile.trajectory && (
        <div>
          <FieldLabel icon={GraduationCap} label="Trayectoria" />
          <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{profile.trajectory}</p>
        </div>
      )}

      {profile.bio && (
        <div>
          <FieldLabel icon={FileText} label="Bio" />
          <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{profile.bio}</p>
        </div>
      )}
    </div>
  )
}

function FieldLabel({ icon: Icon, label }: { icon: typeof IdCard; label: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5">
      <Icon size={13} strokeWidth={1.75} className="text-text-tertiary" aria-hidden="true" />
      <span className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">{label}</span>
    </div>
  )
}

interface EditViewProps {
  draft: IdentityProfile
  setDraft: (d: IdentityProfile) => void
  onSave: () => void
  onCancel: () => void
}

function EditView({ draft, setDraft, onSave, onCancel }: EditViewProps) {
  return (
    <div className="space-y-4">
      <div>
        <FieldLabel icon={IdCard} label="Nombre completo" />
        <Input
          value={draft.fullName}
          placeholder="Tu nombre completo"
          onChange={(e) => setDraft({ ...draft, fullName: e.target.value })}
          autoFocus
        />
      </div>

      <div>
        <FieldLabel icon={Cake} label="Fecha de nacimiento" />
        <Input
          type="date"
          value={draft.birthDate ? draft.birthDate.slice(0, 10) : ''}
          onChange={(e) => setDraft({ ...draft, birthDate: e.target.value || null })}
          className="font-mono"
        />
      </div>

      <div>
        <FieldLabel icon={Briefcase} label="Roles / ocupación" />
        <TagField
          items={draft.roles}
          placeholder="Ej: Bombero, Fundador de Marlab…"
          onChange={(roles) => setDraft({ ...draft, roles })}
        />
      </div>

      <div>
        <FieldLabel icon={MapPin} label="Ubicación" />
        <Input
          value={draft.location}
          placeholder="Ej: Lima, Perú"
          onChange={(e) => setDraft({ ...draft, location: e.target.value })}
        />
      </div>

      <div>
        <FieldLabel icon={Sparkles} label="Intereses / skills" />
        <TagField
          items={draft.interests}
          placeholder="Ej: Taekwondo, Fotografía, Startups…"
          onChange={(interests) => setDraft({ ...draft, interests })}
        />
      </div>

      <div>
        <FieldLabel icon={GraduationCap} label="Trayectoria" />
        <Textarea
          value={draft.trajectory}
          placeholder="Resumen breve: estudios + experiencia…"
          onChange={(e) => setDraft({ ...draft, trajectory: e.target.value })}
          className="min-h-[64px] resize-y"
        />
      </div>

      <div>
        <FieldLabel icon={FileText} label="Bio" />
        <Textarea
          value={draft.bio}
          placeholder="Sobre vos, en pocas líneas…"
          onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
          className="min-h-[64px] resize-y"
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" onClick={onSave} className="inline-flex items-center gap-1.5">
          <Check size={14} strokeWidth={2} aria-hidden="true" />
          Guardar
        </Button>
      </div>
    </div>
  )
}

interface TagFieldProps {
  items: string[]
  placeholder: string
  onChange: (items: string[]) => void
}

function TagField({ items, placeholder, onChange }: TagFieldProps) {
  const [value, setValue] = useState('')

  function add() {
    const v = value.trim()
    if (!v) return
    if (items.includes(v)) { setValue(''); return }
    onChange([...items, v])
    setValue('')
  }
  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((it, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 pl-2 pr-1 py-1 text-xs text-foreground/90"
            >
              {it}
              <button
                type="button"
                onClick={() => remove(i)}
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
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add() }
          }}
        />
        <Button type="button" size="sm" variant="outline" onClick={add} className="flex-shrink-0" aria-label="Agregar rol">
          <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
        </Button>
      </div>
    </div>
  )
}

/** Fechas importantes PROPIAS (aniversarios, fechas personales recurrentes).
 *  Mismo patrón que FechasImportantes de una persona, pero sobre el perfil
 *  propio (identityProfile.specialDates) vía updateIdentityProfile. */
function MisFechasImportantes() {
  const profile = useSelfStore((s) => s.identityProfile)
  const updateIdentityProfile = useSelfStore((s) => s.updateIdentityProfile)

  const [adding, setAdding] = useState(false)
  const [label, setLabel] = useState('')
  const [date, setDate] = useState('')
  const [recurring, setRecurring] = useState(false)
  const [recurringTouched, setRecurringTouched] = useState(false)

  const dates = profile?.specialDates ?? []
  const mounted = useMounted()
  const { valid, invalid } = mounted ? sortSpecialDates(dates) : { valid: [], invalid: [] }

  function resetForm() {
    setLabel('')
    setDate('')
    setRecurring(false)
    setRecurringTouched(false)
    setAdding(false)
  }
  function onLabelChange(value: string) {
    setLabel(value)
    if (!recurringTouched) setRecurring(inferAnnualRecurrence(value))
  }
  function handleAdd() {
    const trimmedLabel = label.trim()
    if (!trimmedLabel) {
      toast.error('Falta la etiqueta', { description: 'Ponele un nombre a la fecha.' })
      return
    }
    if (!parseLocalDate(date)) {
      toast.error('Fecha inválida', { description: 'Elegí una fecha válida.' })
      return
    }
    const newDate: SpecialDate = { id: crypto.randomUUID(), label: trimmedLabel, date, recurring }
    updateIdentityProfile({ specialDates: [...dates, newDate] })
    toast.success('Fecha agregada', { description: trimmedLabel })
    resetForm()
  }
  function handleRemove(id: string, removedLabel: string) {
    updateIdentityProfile({ specialDates: dates.filter((d) => d.id !== id) })
    toast.success('Fecha eliminada', { description: removedLabel })
  }

  return (
    <div className="mt-6 pt-5 border-t border-border/40">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <CalendarHeart size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
            Mis fechas importantes
          </div>
        </div>
        {!adding && (
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
            <Plus size={13} strokeWidth={1.75} className="mr-1" aria-hidden="true" />
            Agregar
          </Button>
        )}
      </div>

      {adding && (
        <div className="mb-4 space-y-3 rounded-md border border-border/60 p-3">
          <div>
            <Label htmlFor="my-sd-label" className="text-xs">Etiqueta</Label>
            <Input
              id="my-sd-label"
              value={label}
              onChange={(e) => onLabelChange(e.target.value)}
              placeholder="Ej: Aniversario, fecha personal…"
              className="mt-1"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="my-sd-date" className="text-xs">Fecha</Label>
            <Input
              id="my-sd-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 font-mono"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setRecurringTouched(true)
              setRecurring((v) => !v)
            }}
            className={cn(
              'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
              recurring
                ? 'border-accent/50 bg-accent/10 text-foreground'
                : 'border-border text-muted-foreground hover:border-accent/40',
            )}
            aria-pressed={recurring}
          >
            <Repeat size={13} strokeWidth={1.75} className={cn(recurring && 'text-brand')} aria-hidden="true" />
            Se repite cada año
          </button>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={resetForm}>Cancelar</Button>
            <Button size="sm" onClick={handleAdd}>Guardar</Button>
          </div>
        </div>
      )}

      {!mounted && dates.length > 0 ? (
        <ul className="space-y-1.5" aria-hidden="true">
          {dates.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 rounded-md border border-border/40 px-3 py-2">
              <div className="h-4 w-28 rounded bg-muted/40 animate-pulse" />
              <div className="h-4 w-14 rounded bg-muted/30 animate-pulse" />
            </li>
          ))}
        </ul>
      ) : valid.length === 0 && invalid.length === 0 ? (
        !adding && (
          <p className="text-sm text-muted-foreground italic leading-relaxed">
            Sin fechas propias. Agregá tus aniversarios o fechas personales con el botón{' '}
            <span className="not-italic font-medium">Agregar</span>.
          </p>
        )
      ) : (
        <ul className="space-y-1.5">
          {valid.map((cd) => (
            <DateRow key={cd.sd.id} cd={cd} onRemove={() => handleRemove(cd.sd.id, cd.sd.label)} />
          ))}
          {invalid.map((sd) => (
            <li
              key={sd.id}
              className="flex items-center justify-between gap-2 rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-xs"
            >
              <span className="flex items-center gap-1.5 text-warn">
                <AlertCircle size={12} strokeWidth={2} aria-hidden="true" />
                {sd.label} · fecha inválida
              </span>
              <RemoveButton onClick={() => handleRemove(sd.id, sd.label)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DateRow({ cd, onRemove }: { cd: SpecialDateCountdown; onRemove: () => void }) {
  const phrase = formatCountdownPhrase(cd)
  const isToday = cd.daysUntil === 0
  return (
    <li
      className={cn(
        'flex items-center justify-between gap-3 rounded-md border border-border/40 px-3 py-2',
        cd.isPast && 'opacity-60',
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{cd.sd.label}</span>
          {cd.recurring && (
            <Badge variant="outline" className="text-[9px] font-normal gap-1 px-1.5 py-0">
              <Repeat size={9} strokeWidth={2} aria-hidden="true" />
              anual
            </Badge>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground font-mono">{formatSpecialDate(cd)}</div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className={cn(
            'text-xs font-medium tabular-nums whitespace-nowrap',
            isToday ? 'text-brand' : cd.isPast ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {phrase}
        </span>
        <RemoveButton onClick={onRemove} />
      </div>
    </li>
  )
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-shrink-0 flex items-center justify-center h-8 w-8 -m-1.5 rounded text-muted-foreground/50 hover:text-bad transition-colors"
      aria-label="Eliminar fecha"
    >
      <X size={14} strokeWidth={1.75} />
    </button>
  )
}
