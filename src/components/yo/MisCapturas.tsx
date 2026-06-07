// SIR V2 — Panel UNIFICADO de capturas propias ("Mis capturas", en /yo).
//
// UNA SOLA caja que acepta VARIAS imágenes a la vez. Por cada archivo corre el
// detector universal y lo rutea al extractor correcto (todos ya existen):
//   - scale            → báscula      (health_metrics)
//   - sleep_panel      → sueño        (sleep_records)
//   - heart_rate_panel → FC           (health_metrics)
//   - linkedin/instagram propios → identity_profile (anclas)
//   - otra persona / unknown → se marca "no es data tuya" y NO se guarda
//     (esas capturas van por /captura).
//
// Cada item es INDEPENDIENTE: uno que falla no rompe el lote. Preview SIEMPRE
// editable antes de guardar (principio del repo: nunca guardar silencioso, nunca
// pisar lo manual). Reusa los previews existentes de cada tipo + la propuesta
// editable de identidad. Las imágenes del perfil propio se consolidan en UNA
// sola propuesta (varias secciones → un perfil). El relato de identidad
// ("Contale a SIR") vive en el mismo panel.
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Sparkles,
  Images,
  X,
  Loader2,
  Scale,
  Moon,
  Heart,
  IdCard,
  Ban,
  Check,
  ArrowRight,
  MessageSquareHeart,
} from 'lucide-react'
import Link from 'next/link'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import { detectCaptureType } from '@/lib/capture/detector/client'
import { routeSelfCapture } from '@/lib/yo/captures/route'
import { compressImage } from '@/lib/capture/scale/compress'

import { ScaleCapturePreview } from '@/components/capture/scale/ScaleCapturePreview'
import { extractScaleCapture, persistScaleCapture } from '@/lib/capture/scale/client'
import type { ScaleCaptureExtracted, ScaleMetric } from '@/lib/capture/scale/types'

import { SleepCapturePreview } from '@/components/capture/sleep/SleepCapturePreview'
import { extractSleepPanel, persistSleepCapture, todayInLima } from '@/lib/capture/sleep/client'
import type { SleepCaptureFinal, SleepPanelExtracted } from '@/lib/capture/sleep/types'

import { HeartRateCapturePreview } from '@/components/capture/hr/HeartRateCapturePreview'
import { extractHeartRatePanel, persistHeartRateCapture } from '@/lib/capture/hr/client'
import type { HeartRateCaptureFinal, HeartRatePanelExtracted } from '@/lib/capture/hr/types'

import { IdentityProposalReview } from '@/components/yo/IdentityProposalReview'
import { ContaleASir } from '@/components/yo/ContaleASir'
import { extractSelfProfileImage } from '@/lib/identity/captureClient'
import { consolidateSelfProfiles } from '@/lib/capture/self-profile/consolidate'
import type { SelfProfileExtracted } from '@/lib/capture/self-profile/types'
import { buildCaptureProposal, type CaptureProposalDiff } from '@/lib/identity/applyCapture'
import {
  emptyIdentityProfile,
  normalizeIdentityProfile,
  type IdentityProfile,
} from '@/lib/identity'
import { useSelfStore } from '@/stores/useSelfStore'

// ─── modelo de items ────────────────────────────────────────────────

type BioKind = 'scale' | 'sleep' | 'hr'
type BioStatus = 'extracting' | 'ready' | 'saving' | 'saved' | 'error'

interface BioItem {
  id: string
  kind: BioKind
  fileName: string
  previewUrl: string
  blob: Blob
  status: BioStatus
  error?: string
  savedSummary?: string
  scale?: ScaleCaptureExtracted
  sleep?: SleepPanelExtracted
  hr?: HeartRatePanelExtracted
}

interface RejectItem {
  id: string
  fileName: string
  reason: string
}

type IdStatus = 'extracting' | 'ready' | 'saving' | 'saved' | 'illegible' | 'error'

interface IdentityState {
  fileNames: string[]
  count: number
  status: IdStatus
  error?: string
  draft: IdentityProfile | null
  diff: CaptureProposalDiff | null
}

const BIO_META: Record<BioKind, { icon: typeof Scale; label: string }> = {
  scale: { icon: Scale, label: 'Báscula' },
  sleep: { icon: Moon, label: 'Sueño' },
  hr: { icon: Heart, label: 'Frecuencia cardíaca' },
}

function fileKey(f: File): string {
  return `${f.name}:${f.size}:${f.lastModified}`
}

/** Concurrencia acotada (no saturar Vision / rate-limit). */
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

// ─── componente ─────────────────────────────────────────────────────

export function MisCapturas() {
  const setIdentityProfile = useSelfStore((s) => s.setIdentityProfile)

  const inputRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const objectUrls = useRef<Set<string>>(new Set())

  const [files, setFiles] = useState<File[]>([])
  const [processing, setProcessing] = useState(false)
  const [detectProgress, setDetectProgress] = useState<{ done: number; total: number } | null>(null)

  const [bioItems, setBioItems] = useState<BioItem[]>([])
  const [rejectItems, setRejectItems] = useState<RejectItem[]>([])
  const [identity, setIdentity] = useState<IdentityState | null>(null)

  // Revocar object URLs al desmontar.
  useEffect(() => {
    const set = objectUrls.current
    return () => {
      for (const url of set) URL.revokeObjectURL(url)
      set.clear()
    }
  }, [])

  const makeUrl = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob)
    objectUrls.current.add(url)
    return url
  }, [])

  const patchBio = useCallback((id: string, patch: Partial<BioItem>) => {
    setBioItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))
  }, [])

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
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  const removeStaged = useCallback((idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const hasResults = bioItems.length > 0 || rejectItems.length > 0 || identity !== null

  const resetResults = useCallback(() => {
    setBioItems([])
    setRejectItems([])
    setIdentity(null)
  }, [])

  // ─── procesar el lote ─────────────────────────────────────────────
  const process = useCallback(async () => {
    if (files.length === 0 || processing) return
    setProcessing(true)
    resetResults()
    const batch = files
    setFiles([])
    setDetectProgress({ done: 0, total: batch.length })

    // 1) Detectar el tipo de cada archivo (independiente: si falla, rechazo).
    type Plan =
      | { file: File; route: 'scale' | 'sleep' | 'hr' }
      | { file: File; route: 'identity' }
      | { file: File; route: 'reject'; reason: string }
    const plans: Plan[] = []
    let done = 0
    await runPool(batch, 3, async (file) => {
      try {
        const res = await detectCaptureType(file)
        const decision = routeSelfCapture(res.detected.type)
        if (decision.route === 'reject') {
          plans.push({ file, route: 'reject', reason: decision.reason ?? 'No es data tuya.' })
        } else if (decision.route === 'identity') {
          plans.push({ file, route: 'identity' })
        } else {
          plans.push({ file, route: decision.route })
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'No se pudo analizar la imagen.'
        plans.push({ file, route: 'reject', reason: `No se pudo analizar: ${msg}` })
      } finally {
        done += 1
        setDetectProgress({ done, total: batch.length })
      }
    })

    // 2) Particionar.
    const rejects = plans.filter((p) => p.route === 'reject') as Extract<Plan, { route: 'reject' }>[]
    const identityFiles = plans.filter((p) => p.route === 'identity').map((p) => p.file)
    const bioPlans = plans.filter(
      (p) => p.route === 'scale' || p.route === 'sleep' || p.route === 'hr',
    ) as Extract<Plan, { route: 'scale' | 'sleep' | 'hr' }>[]

    setRejectItems(
      rejects.map((r, i) => ({ id: `rej_${Date.now()}_${i}`, fileName: r.file.name, reason: r.reason })),
    )
    setProcessing(false)
    setDetectProgress(null)

    // 3) Extraer biométricas (cada una independiente).
    if (bioPlans.length > 0) {
      // Sembrar items "extracting" en orden estable.
      const seeded: { id: string; plan: Extract<Plan, { route: 'scale' | 'sleep' | 'hr' }> }[] = []
      for (let i = 0; i < bioPlans.length; i++) {
        seeded.push({ id: `bio_${Date.now()}_${i}`, plan: bioPlans[i] })
      }
      setBioItems(
        seeded.map(({ id, plan }) => ({
          id,
          kind: plan.route,
          fileName: plan.file.name,
          previewUrl: '',
          blob: new Blob(),
          status: 'extracting' as BioStatus,
        })),
      )
      void runPool(seeded, 3, async ({ id, plan }) => {
        try {
          if (plan.route === 'scale') {
            const compressed = await compressImage(plan.file)
            const url = makeUrl(compressed.blob)
            const extracted = await extractScaleCapture(compressed.blob)
            patchBio(id, { previewUrl: url, blob: compressed.blob, scale: extracted, status: 'ready' })
          } else if (plan.route === 'sleep') {
            const compressed = await compressImage(plan.file, { maxSize: 1280, quality: 0.9 })
            const url = makeUrl(compressed.blob)
            const extracted = await extractSleepPanel(compressed.blob)
            patchBio(id, { previewUrl: url, blob: compressed.blob, sleep: extracted, status: 'ready' })
          } else {
            const compressed = await compressImage(plan.file, { maxSize: 1280, quality: 0.9 })
            const url = makeUrl(compressed.blob)
            const extracted = await extractHeartRatePanel(compressed.blob)
            patchBio(id, { previewUrl: url, blob: compressed.blob, hr: extracted, status: 'ready' })
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Error al procesar la imagen.'
          patchBio(id, { status: 'error', error: msg })
        }
      })
    }

    // 4) Extraer identidad (varias imágenes → UNA propuesta consolidada).
    if (identityFiles.length > 0) {
      setIdentity({
        fileNames: identityFiles.map((f) => f.name),
        count: 0,
        status: 'extracting',
        draft: null,
        diff: null,
      })
      void (async () => {
        const results: SelfProfileExtracted[] = []
        let failed = 0
        await runPool(identityFiles, 3, async (file) => {
          try {
            results.push(await extractSelfProfileImage(file))
          } catch {
            failed += 1
          }
        })
        if (results.length === 0) {
          setIdentity((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'error',
                  error:
                    failed > 0
                      ? `${failed} imagen(es) no se pudieron procesar. Reintentá en unos segundos.`
                      : 'No se pudo procesar tu perfil.',
                }
              : prev,
          )
          return
        }
        const consolidated = consolidateSelfProfiles(results)!
        const base = useSelfStore.getState().identityProfile ?? emptyIdentityProfile('idn_' + Date.now())
        const proposal = buildCaptureProposal(base, consolidated)

        const nothingUsable =
          !proposal.hasChanges &&
          consolidated.confidence === 'low' &&
          consolidated.roles.length === 0 &&
          consolidated.interests.length === 0 &&
          consolidated.skills.length === 0 &&
          !consolidated.fullName &&
          !consolidated.birthDate
        setIdentity((prev) =>
          prev
            ? nothingUsable
              ? { ...prev, status: 'illegible', count: results.length }
              : {
                  ...prev,
                  status: 'ready',
                  count: results.length,
                  draft: proposal.proposed,
                  diff: proposal.diff,
                }
            : prev,
        )
      })()
    }
  }, [files, processing, resetResults, makeUrl, patchBio])

  // ─── guardado por tipo ────────────────────────────────────────────

  const saveScale = useCallback(
    async (item: BioItem, finalMetrics: Partial<Record<ScaleMetric, number>>, measuredAt: string) => {
      patchBio(item.id, { status: 'saving' })
      try {
        const result = await persistScaleCapture({
          finalMetrics,
          measuredAt,
          imageBlob: item.blob,
          confidence: item.scale?.confidence,
        })
        patchBio(item.id, {
          status: 'saved',
          savedSummary: `${result.insertedCount} métrica${result.insertedCount === 1 ? '' : 's'} guardada${result.insertedCount === 1 ? '' : 's'}`,
        })
        toast.success(`${result.insertedCount} métricas guardadas`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Falló al guardar.'
        toast.error('No se pudo guardar', { description: msg })
        patchBio(item.id, { status: 'ready' })
      }
    },
    [patchBio],
  )

  const saveSleep = useCallback(
    (item: BioItem, final: SleepCaptureFinal) => {
      patchBio(item.id, { status: 'saving' })
      try {
        const result = persistSleepCapture(final)
        patchBio(item.id, {
          status: 'saved',
          savedSummary: `${result.durationHours}h · calidad ${result.quality}/10${result.replaced ? ' (actualizada)' : ''}`,
        })
        toast.success(result.replaced ? 'Noche actualizada' : 'Sueño guardado')
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Falló al guardar.'
        toast.error('No se pudo guardar', { description: msg })
        patchBio(item.id, { status: 'ready' })
      }
    },
    [patchBio],
  )

  const saveHr = useCallback(
    (item: BioItem, final: HeartRateCaptureFinal) => {
      patchBio(item.id, { status: 'saving' })
      try {
        const result = persistHeartRateCapture(final)
        const summary = result.restingBpm
          ? `FC reposo ${result.restingBpm} ppm${result.replaced ? ' (actualizada)' : ''}`
          : `${result.insertedCount} métrica(s)${result.replaced ? ' (actualizada)' : ''}`
        patchBio(item.id, { status: 'saved', savedSummary: summary })
        toast.success(result.replaced ? 'FC actualizada' : 'FC guardada')
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Falló al guardar.'
        toast.error('No se pudo guardar', { description: msg })
        patchBio(item.id, { status: 'ready' })
      }
    },
    [patchBio],
  )

  const saveIdentity = useCallback(() => {
    setIdentity((prev) => {
      if (!prev || !prev.draft) return prev
      const clean = normalizeIdentityProfile({ ...prev.draft, updatedAt: new Date().toISOString() })
      setIdentityProfile(clean)
      toast.success('Identidad actualizada', {
        description: prev.count > 1 ? `Combiné ${prev.count} pantallazos.` : 'Desde tu pantallazo.',
      })
      return { ...prev, status: 'saved' }
    })
  }, [setIdentityProfile])

  const setIdentityDraft = useCallback((d: IdentityProfile) => {
    setIdentity((prev) => (prev ? { ...prev, draft: d } : prev))
  }, [])

  // ─── Guardar todo ─────────────────────────────────────────────────
  const saveAll = useCallback(() => {
    // Biométricas: disparar el submit de cada preview lista (reusa su propia
    // validación + onConfirm). Cada una es independiente; los errores se
    // capturan en sus handlers de guardado.
    for (const it of bioItems) {
      if (it.status !== 'ready') continue
      const node = itemRefs.current.get(it.id)
      node?.querySelector('form')?.requestSubmit()
    }
    if (identity?.status === 'ready') saveIdentity()
  }, [bioItems, identity, saveIdentity])

  const pendingCount =
    bioItems.filter((it) => it.status === 'ready').length + (identity?.status === 'ready' ? 1 : 0)

  // ─── render ───────────────────────────────────────────────────────

  return (
    <Card className="mb-6 border-primary/20 shadow-none transition-colors duration-200">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={16} strokeWidth={1.75} className="text-primary flex-shrink-0" aria-hidden="true" />
          <h2 className="text-base sm:text-lg font-semibold tracking-tight">Mis capturas</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4 leading-snug">
          Una sola caja para tu data: subí varios pantallazos a la vez (báscula, sueño, frecuencia
          cardíaca o tu propio perfil de LinkedIn/Instagram). SIR detecta cada uno y lo manda al lugar
          correcto. Revisás y guardás. Las capturas de <span className="font-medium">otras personas</span> van por{' '}
          <Link href="/captura" className="underline underline-offset-2 hover:text-foreground">Captura</Link>.
        </p>

        {/* Caja única multi-archivo */}
        <div className="space-y-3 rounded-md border border-border/60 bg-muted/10 p-3">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={onFiles}
            disabled={processing}
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
                    onClick={() => removeStaged(idx)}
                    disabled={processing}
                    aria-label={`Quitar ${f.name}`}
                    className="flex-shrink-0 rounded p-0.5 text-muted-foreground/60 hover:text-bad hover:bg-bad-soft transition-colors disabled:opacity-40"
                  >
                    <X size={13} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {processing && detectProgress && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
              <span>Detectando {Math.min(detectProgress.done + 1, detectProgress.total)} de {detectProgress.total}…</span>
            </div>
          )}

          <Button size="sm" onClick={process} disabled={files.length === 0 || processing} className="w-full sm:w-auto">
            {processing ? (
              <><Loader2 size={14} className="mr-2 animate-spin" />Detectando…</>
            ) : files.length > 1 ? (
              `Procesar ${files.length} capturas`
            ) : (
              'Procesar captura'
            )}
          </Button>
        </div>

        {/* Resultados del lote */}
        {hasResults && (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
                Resultados del lote
              </div>
              {pendingCount > 1 && (
                <Button size="sm" variant="outline" onClick={saveAll} className="inline-flex items-center gap-1.5">
                  <Check size={13} strokeWidth={2} aria-hidden="true" />
                  Guardar todo ({pendingCount})
                </Button>
              )}
            </div>

            {/* Identidad (perfil propio) */}
            {identity && (
              <IdentityResult
                state={identity}
                onChangeDraft={setIdentityDraft}
                onSave={saveIdentity}
                onDismiss={() => setIdentity(null)}
              />
            )}

            {/* Biométricas */}
            {bioItems.map((item) => (
              <div
                key={item.id}
                ref={(el) => {
                  if (el) itemRefs.current.set(item.id, el)
                  else itemRefs.current.delete(item.id)
                }}
              >
                <BioResult
                  item={item}
                  onSaveScale={saveScale}
                  onSaveSleep={saveSleep}
                  onSaveHr={saveHr}
                  onDismiss={() => setBioItems((prev) => prev.filter((b) => b.id !== item.id))}
                />
              </div>
            ))}

            {/* Rechazadas */}
            {rejectItems.map((item) => (
              <div
                key={item.id}
                className="rounded-md border border-warn/30 bg-warn/5 p-3 flex items-start gap-2.5"
              >
                <Ban size={15} strokeWidth={1.75} className="text-warn flex-shrink-0 mt-0.5" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-foreground truncate font-mono">{item.fileName}</div>
                  <div className="text-[11px] text-warn-foreground leading-snug mt-0.5">{item.reason}</div>
                </div>
                <Button size="sm" variant="ghost" asChild className="flex-shrink-0 -my-1">
                  <Link href="/captura" className="inline-flex items-center gap-1 text-xs">
                    Captura <ArrowRight size={12} strokeWidth={1.75} aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Contale a SIR (relato de identidad) */}
        <div className="mt-6 pt-5 border-t border-border/40">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquareHeart size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
              Contale a SIR quién sos
            </div>
          </div>
          <ContaleASir />
        </div>
      </CardContent>
    </Card>
  )
}

// ─── sub-render: item biométrico ────────────────────────────────────

function BioResult({
  item,
  onSaveScale,
  onSaveSleep,
  onSaveHr,
  onDismiss,
}: {
  item: BioItem
  onSaveScale: (item: BioItem, finalMetrics: Partial<Record<ScaleMetric, number>>, measuredAt: string) => void
  onSaveSleep: (item: BioItem, final: SleepCaptureFinal) => void
  onSaveHr: (item: BioItem, final: HeartRateCaptureFinal) => void
  onDismiss: () => void
}) {
  const meta = BIO_META[item.kind]
  const Icon = meta.icon

  if (item.status === 'extracting') {
    return (
      <div className="rounded-md border border-border/60 bg-muted/10 p-3 flex items-center gap-2.5">
        <Icon size={15} strokeWidth={1.75} className="text-primary/70 flex-shrink-0" aria-hidden="true" />
        <span className="text-xs font-medium text-foreground">{meta.label}</span>
        <span className="text-[11px] text-muted-foreground font-mono truncate min-w-0 flex-1">{item.fileName}</span>
        <Loader2 size={13} className="animate-spin text-muted-foreground flex-shrink-0" aria-hidden="true" />
      </div>
    )
  }

  if (item.status === 'saved') {
    return (
      <div className="rounded-md border border-ok/30 bg-ok-soft p-3 flex items-center gap-2.5">
        <Check size={15} strokeWidth={2} className="text-ok flex-shrink-0" aria-hidden="true" />
        <span className="text-xs font-medium text-foreground">{meta.label}</span>
        <span className="text-[11px] text-ok flex-1 min-w-0 truncate">{item.savedSummary ?? 'Guardado.'}</span>
      </div>
    )
  }

  if (item.status === 'error') {
    return (
      <div className="rounded-md border border-bad/30 bg-bad-soft p-3 flex items-start gap-2.5">
        <Icon size={15} strokeWidth={1.75} className="text-bad flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-foreground">{meta.label} · {item.fileName}</div>
          <div className="text-[11px] text-bad leading-snug mt-0.5">{item.error ?? 'No se pudo procesar.'}</div>
        </div>
        <Button size="sm" variant="ghost" onClick={onDismiss} className="flex-shrink-0 -my-1">Quitar</Button>
      </div>
    )
  }

  // ready / saving → preview editable
  const header = (
    <div className="flex items-center gap-2 px-1 pb-2">
      <Icon size={14} strokeWidth={1.75} className="text-primary/80 flex-shrink-0" aria-hidden="true" />
      <span className="text-xs font-medium text-foreground">{meta.label}</span>
      <Badge variant="outline" className="text-[9px] font-mono uppercase tracking-wider">{item.fileName}</Badge>
    </div>
  )

  if (item.kind === 'scale' && item.scale) {
    return (
      <div>
        {header}
        <ScaleCapturePreview
          previewUrl={item.previewUrl}
          extracted={item.scale}
          saving={item.status === 'saving'}
          onCancel={onDismiss}
          onConfirm={({ finalMetrics, measuredAt }) => onSaveScale(item, finalMetrics, measuredAt)}
        />
      </div>
    )
  }
  if (item.kind === 'sleep' && item.sleep) {
    return (
      <div>
        {header}
        <SleepCapturePreview
          previewUrl={item.previewUrl}
          extracted={item.sleep}
          fallbackDay={todayInLima()}
          saving={item.status === 'saving'}
          onCancel={onDismiss}
          onConfirm={(final) => onSaveSleep(item, final)}
        />
      </div>
    )
  }
  if (item.kind === 'hr' && item.hr) {
    return (
      <div>
        {header}
        <HeartRateCapturePreview
          previewUrl={item.previewUrl}
          extracted={item.hr}
          fallbackDay={todayInLima()}
          saving={item.status === 'saving'}
          onCancel={onDismiss}
          onConfirm={(final) => onSaveHr(item, final)}
        />
      </div>
    )
  }
  return null
}

// ─── sub-render: item de identidad ──────────────────────────────────

function IdentityResult({
  state,
  onChangeDraft,
  onSave,
  onDismiss,
}: {
  state: IdentityState
  onChangeDraft: (d: IdentityProfile) => void
  onSave: () => void
  onDismiss: () => void
}) {
  if (state.status === 'extracting') {
    return (
      <div className="rounded-md border border-border/60 bg-muted/10 p-3 flex items-center gap-2.5">
        <IdCard size={15} strokeWidth={1.75} className="text-primary/70 flex-shrink-0" aria-hidden="true" />
        <span className="text-xs font-medium text-foreground">Tu perfil</span>
        <span className="text-[11px] text-muted-foreground flex-1 min-w-0 truncate">
          Leyendo {state.fileNames.length} {state.fileNames.length === 1 ? 'imagen' : 'imágenes'}…
        </span>
        <Loader2 size={13} className="animate-spin text-muted-foreground flex-shrink-0" aria-hidden="true" />
      </div>
    )
  }

  if (state.status === 'saved') {
    return (
      <div className="rounded-md border border-ok/30 bg-ok-soft p-3 flex items-center gap-2.5">
        <Check size={15} strokeWidth={2} className="text-ok flex-shrink-0" aria-hidden="true" />
        <span className="text-xs font-medium text-foreground">Tu perfil</span>
        <span className="text-[11px] text-ok flex-1 min-w-0 truncate">Anclas de identidad actualizadas.</span>
      </div>
    )
  }

  if (state.status === 'illegible') {
    return (
      <div className="rounded-md border border-warn/30 bg-warn/5 p-3 flex items-start gap-2.5">
        <IdCard size={15} strokeWidth={1.75} className="text-warn flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-foreground">Tu perfil</div>
          <div className="text-[11px] text-warn-foreground leading-snug mt-0.5">
            No pude leer datos claros. Probá con capturas más nítidas o más cercanas —
            las secciones del perfil (no la página entera), con la letra grande. No guardé nada.
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={onDismiss} className="flex-shrink-0 -my-1">Quitar</Button>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="rounded-md border border-bad/30 bg-bad-soft p-3 flex items-start gap-2.5">
        <IdCard size={15} strokeWidth={1.75} className="text-bad flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-foreground">Tu perfil</div>
          <div className="text-[11px] text-bad leading-snug mt-0.5">{state.error ?? 'No se pudo procesar.'}</div>
        </div>
        <Button size="sm" variant="ghost" onClick={onDismiss} className="flex-shrink-0 -my-1">Quitar</Button>
      </div>
    )
  }

  // ready → propuesta editable
  if (!state.draft) return null
  return (
    <div>
      <div className="flex items-center gap-2 px-1 pb-2">
        <IdCard size={14} strokeWidth={1.75} className="text-primary/80 flex-shrink-0" aria-hidden="true" />
        <span className="text-xs font-medium text-foreground">Tu perfil</span>
        <Badge variant="outline" className="text-[9px] font-mono uppercase tracking-wider">
          {state.count} {state.count === 1 ? 'imagen' : 'imágenes'}
        </Badge>
      </div>
      <IdentityProposalReview
        draft={state.draft}
        setDraft={onChangeDraft}
        diff={state.diff}
        source="image"
        usedCount={state.count}
        onSave={onSave}
        onCancel={onDismiss}
        cancelLabel="Quitar"
      />
    </div>
  )
}
