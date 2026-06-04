// SIR V2 — AUTO-CAPTURA del perfil propio (sub-panel de Identidad en /yo).
//
// Aaron sube VARIOS screenshots de SU propio LinkedIn/Instagram. Cada imagen
// pasa por Visión (una llamada por imagen, concurrencia acotada → sin timeout),
// se CONSOLIDA en un solo objeto (puro) y se arma una PROPUESTA que MERGEA con
// su identity_profile sin pisar lo que escribió a mano. La propuesta es
// EDITABLE: revisa, corrige y recién ahí guarda (review-before-save, igual que
// la captura de personas).
'use client'

import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Camera,
  Loader2,
  Check,
  X,
  Images,
  Plus,
  AlertCircle,
  Sparkles,
  Briefcase,
  MapPin,
  GraduationCap,
  FileText,
  IdCard,
  Cake,
  MessageSquareHeart,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { useSelfStore } from '@/stores/useSelfStore'
import {
  emptyIdentityProfile,
  normalizeIdentityProfile,
  type IdentityProfile,
} from '@/lib/identity'
import { buildCaptureProposal, type CaptureProposalDiff } from '@/lib/identity/applyCapture'
import {
  extractSelfProfileImage,
  extractSelfProfileText,
  HttpError,
} from '@/lib/identity/captureClient'
import { consolidateSelfProfiles } from '@/lib/capture/self-profile/consolidate'
import type { SelfProfileExtracted } from '@/lib/capture/self-profile/types'
import { cn } from '@/lib/utils'

type Phase = 'idle' | 'working' | 'review' | 'done' | 'illegible'
type Mode = 'image' | 'text'

interface ErrorState {
  status: number
  message: string
  detail?: string
}

function fileKey(f: File): string {
  return `${f.name}:${f.size}:${f.lastModified}`
}

/** Concurrencia acotada (no saturar Vision/rate-limit). */
async function runPool<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      await worker(items[i], i)
    }
  })
  await Promise.all(lanes)
}

function toError(e: unknown): ErrorState {
  if (e instanceof HttpError) return { status: e.status, message: e.message, detail: e.detail }
  return { status: 0, message: e instanceof Error ? e.message : String(e) }
}

export interface SelfProfileCaptureProps {
  onClose: () => void
}

export function SelfProfileCapture({ onClose }: SelfProfileCaptureProps) {
  const profile = useSelfStore((s) => s.identityProfile)
  const setIdentityProfile = useSelfStore((s) => s.setIdentityProfile)

  const inputRef = useRef<HTMLInputElement>(null)
  // Dos entradas: pantallazos (Visión) o relato libre (texto). Default: relato,
  // que es la versión mínima del onboarding conversacional que pidió Aaron.
  const [mode, setMode] = useState<Mode>('text')
  const [files, setFiles] = useState<File[]>([])
  const [narrative, setNarrative] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<ErrorState | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  // Propuesta editable + resumen de qué cambia.
  const [draft, setDraft] = useState<IdentityProfile | null>(null)
  const [diff, setDiff] = useState<CaptureProposalDiff | null>(null)
  const [usedCount, setUsedCount] = useState(0)
  const [proposalSource, setProposalSource] = useState<Mode>('image')

  const working = phase === 'working'

  const onFiles = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? [])
    if (picked.length > 0) {
      setFiles((prev) => {
        const seen = new Set(prev.map(fileKey))
        const merged = [...prev]
        for (const f of picked) {
          const k = fileKey(f)
          if (!seen.has(k)) {
            seen.add(k)
            merged.push(f)
          }
        }
        return merged
      })
    }
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  const removeFile = useCallback((idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  // Común a ambas vías: consolida lo extraído, arma la propuesta sobre el perfil
  // actual (sin pisar lo escrito a mano) y enruta a revisión / "no leí nada".
  const presentResults = useCallback(
    (results: SelfProfileExtracted[], source: Mode, count: number) => {
      const consolidated = consolidateSelfProfiles(results)!
      const base = profile ?? emptyIdentityProfile('idn_' + Date.now())
      const proposal = buildCaptureProposal(base, consolidated)

      setProposalSource(source)
      setUsedCount(count)

      const nothingUsable =
        !proposal.hasChanges &&
        consolidated.confidence === 'low' &&
        consolidated.roles.length === 0 &&
        consolidated.interests.length === 0 &&
        consolidated.skills.length === 0 &&
        !consolidated.fullName &&
        !consolidated.birthDate
      if (nothingUsable) {
        setPhase('illegible')
        return
      }
      setDraft(proposal.proposed)
      setDiff(proposal.diff)
      setPhase('review')
    },
    [profile],
  )

  const scan = useCallback(async () => {
    if (files.length === 0) return
    setPhase('working')
    setError(null)
    setProgress({ done: 0, total: files.length })

    const results: SelfProfileExtracted[] = []
    let done = 0
    let failed = 0
    await runPool(files, 3, async (file) => {
      try {
        results.push(await extractSelfProfileImage(file))
      } catch {
        failed += 1
      } finally {
        done += 1
        setProgress({ done, total: files.length })
      }
    })

    if (results.length === 0) {
      setError({
        status: 0,
        message: 'No se pudo procesar ninguna imagen',
        detail: failed > 0 ? `${failed} fallaron. Reintentá en unos segundos.` : undefined,
      })
      setPhase('idle')
      return
    }
    presentResults(results, 'image', results.length)
  }, [files, presentResults])

  const runText = useCallback(async () => {
    const text = narrative.trim()
    if (text.length < 12) return
    setPhase('working')
    setError(null)
    setProgress(null)
    try {
      const extracted = await extractSelfProfileText(text)
      presentResults([extracted], 'text', 1)
    } catch (e) {
      setError(toError(e))
      setPhase('idle')
    }
  }, [narrative, presentResults])

  const save = useCallback(() => {
    if (!draft) return
    const clean = normalizeIdentityProfile({ ...draft, updatedAt: new Date().toISOString() })
    setIdentityProfile(clean)
    setPhase('done')
    toast.success('Identidad actualizada', {
      description:
        proposalSource === 'text'
          ? 'Desde lo que le contaste a SIR.'
          : usedCount > 1
            ? `Combiné ${usedCount} pantallazos.`
            : 'Desde tu pantallazo.',
    })
  }, [draft, setIdentityProfile, proposalSource, usedCount])

  // ─── DONE ─────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div className="space-y-3 rounded-md border border-ok/30 bg-ok-soft p-3">
        <div className="flex items-center gap-2 text-xs text-ok">
          <Check size={14} strokeWidth={2} className="flex-shrink-0" aria-hidden="true" />
          Tus anclas quedaron actualizadas con lo capturado.
        </div>
        <Button size="sm" variant="outline" onClick={onClose} className="w-full">
          Listo
        </Button>
      </div>
    )
  }

  // ─── ILLEGIBLE ────────────────────────────────────────────────────
  if (phase === 'illegible') {
    return (
      <div className="space-y-3">
        <div className="rounded-md border border-warn/30 bg-warn/5 p-3 text-xs flex items-start gap-2">
          <AlertCircle size={14} strokeWidth={1.75} className="text-warn flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span className="text-warn-foreground">
            {proposalSource === 'text' ? (
              <>No pude sacar datos claros de tu relato. Contá un poco más sobre vos —
              a qué te dedicás, qué te importa, dónde vivís. No guardé nada.</>
            ) : (
              <>No pude leer datos claros. Probá con capturas más nítidas o más cercanas —
              las <span className="font-medium">secciones del perfil</span> (no la página entera),
              con la letra grande. No guardé nada.</>
            )}
          </span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { setFiles([]); setPhase('idle') }} className="w-full">
            {proposalSource === 'text' ? 'Volver a intentar' : 'Elegir otras imágenes'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose} className="w-full">
            Cerrar
          </Button>
        </div>
      </div>
    )
  }

  // ─── REVIEW (propuesta editable) ──────────────────────────────────
  if (phase === 'review' && draft) {
    return (
      <ProposalReview
        draft={draft}
        setDraft={setDraft}
        diff={diff}
        source={proposalSource}
        usedCount={usedCount}
        onSave={save}
        onCancel={onClose}
      />
    )
  }

  // ─── IDLE / WORKING ───────────────────────────────────────────────
  return (
    <div className="space-y-3 rounded-md border border-border/60 bg-muted/10 p-3">
      <div className="flex items-center gap-2">
        <Sparkles size={14} strokeWidth={1.75} className="text-primary/80 flex-shrink-0" aria-hidden="true" />
        <span className="text-xs font-medium text-foreground">Que SIR te conozca</span>
      </div>

      {/* Selector de entrada: CONTALE (relato) · PANTALLAZOS. */}
      <div className="inline-flex flex-wrap rounded-md border border-border p-0.5 text-xs">
        <ModeTab
          active={mode === 'text'}
          onClick={() => { setMode('text'); setError(null) }}
          icon={<MessageSquareHeart size={12} strokeWidth={1.75} aria-hidden="true" />}
          label="Contale a SIR"
          disabled={working}
        />
        <ModeTab
          active={mode === 'image'}
          onClick={() => { setMode('image'); setError(null) }}
          icon={<Camera size={12} strokeWidth={1.75} aria-hidden="true" />}
          label="Pantallazos"
          disabled={working}
        />
      </div>

      {mode === 'text' ? (
        <>
          <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
            Contá en tus palabras <span className="font-medium text-foreground">quién sos</span>: a qué te
            dedicás, qué te importa, cuándo naciste, dónde vivís. Escribí o dictá un párrafo — yo saco las
            anclas y te las muestro para revisar.{' '}
            <span className="font-medium text-foreground">Nunca piso lo que ya escribiste.</span>
          </p>
          <textarea
            value={narrative}
            onChange={(e) => { setNarrative(e.target.value); setError(null) }}
            disabled={working}
            rows={6}
            placeholder="Ej: Soy Aaron, bombero voluntario y fundador de Marlab. Nací el 30 de mayo de 1990 en Lima. Me apasiona el taekwondo y la fotografía…"
            className="w-full rounded-md border border-border bg-background p-2.5 text-sm leading-relaxed disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-accent/40"
          />

          {error && <ApiErrorNotice error={error} className="p-2" />}

          <div className="flex gap-2">
            <Button size="sm" onClick={runText} disabled={narrative.trim().length < 12 || working} className="w-full">
              {working ? (
                <><Loader2 size={14} className="mr-2 animate-spin" />Procesando…</>
              ) : (
                <><MessageSquareHeart size={14} strokeWidth={1.75} className="mr-2" aria-hidden="true" />Procesar relato</>
              )}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} disabled={working} className="w-full">
              Cancelar
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
            Subí <span className="font-medium text-foreground">capturas de TU propio LinkedIn y/o Instagram</span>{' '}
            (varias secciones). Extraigo tus roles, intereses, ubicación y trayectoria para revisar —{' '}
            <span className="font-medium text-foreground">nunca piso lo que ya escribiste</span>.
          </p>

          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={onFiles}
            disabled={working}
            className="text-sm w-full file:mr-3 file:rounded file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-accent/10 disabled:opacity-50"
          />

          {files.length > 0 && (
            <div className="rounded-md border border-border/60 bg-background divide-y divide-border/30">
              {files.map((f, idx) => (
                <div key={`${fileKey(f)}:${idx}`} className="flex items-center gap-2 px-2.5 py-1.5 text-[11px]">
                  <Images size={12} strokeWidth={1.75} className="text-muted-foreground/60 flex-shrink-0" aria-hidden="true" />
                  <span className="text-foreground truncate min-w-0 flex-1 font-mono">{f.name}</span>
                  <span className="text-muted-foreground/70 flex-shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    disabled={working}
                    aria-label={`Quitar ${f.name}`}
                    className="flex-shrink-0 rounded p-0.5 text-muted-foreground/60 hover:text-bad hover:bg-bad-soft transition-colors disabled:opacity-40"
                  >
                    <X size={13} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {working && progress && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
              <span>Procesando imagen {Math.min(progress.done + 1, progress.total)} de {progress.total}…</span>
            </div>
          )}

          {error && <ApiErrorNotice error={error} className="p-2" />}

          <div className="flex gap-2">
            <Button size="sm" onClick={scan} disabled={files.length === 0 || working} className="w-full">
              {working ? (
                <><Loader2 size={14} className="mr-2 animate-spin" />Procesando…</>
              ) : files.length > 1 ? (
                `Escanear y combinar ${files.length} imágenes`
              ) : (
                'Escanear'
              )}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} disabled={working} className="w-full">
              Cancelar
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Propuesta editable ──────────────────────────────────────────────

const FILLED_LABEL: Record<CaptureProposalDiff['filled'][number]['field'], string> = {
  fullName: 'nombre',
  birthDate: 'nacimiento',
  location: 'ubicación',
  bio: 'bio',
  trajectory: 'trayectoria',
}

function ProposalReview({
  draft,
  setDraft,
  diff,
  source,
  usedCount,
  onSave,
  onCancel,
}: {
  draft: IdentityProfile
  setDraft: (d: IdentityProfile) => void
  diff: CaptureProposalDiff | null
  source: Mode
  usedCount: number
  onSave: () => void
  onCancel: () => void
}) {
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
        <Button size="sm" variant="ghost" onClick={onCancel}>Descartar</Button>
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

function ModeTab({
  active,
  onClick,
  icon,
  label,
  disabled,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors disabled:opacity-50',
        active ? 'bg-accent/15 text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
