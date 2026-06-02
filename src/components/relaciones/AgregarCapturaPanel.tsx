'use client'
// SIR V2 — AgregarCapturaPanel: captura EN CONTEXTO de una persona.
//
// Aaron quería subir una captura desde el detalle de la persona y que se
// asocie DIRECTO a ella, sin re-seleccionar en /captura. Acá la persona está
// FIJA: subís la imagen, el detector reconoce el tipo y se procesa hacia el
// perfil de ESTA persona — sin matcher.
//
// REVIEW-BEFORE-SAVE (hito 2): primero hacemos un PREVIEW (extrae sin guardar).
// Si la confianza es alta → guardamos directo. Si es media/baja/desconocida →
// mostramos los campos extraídos para que el usuario los revise y CONFIRME o
// DESCARTE antes de persistir. Así no entra basura silenciosamente.
//
// Reusa el pipeline existente: detectCaptureType + previewCapture/processCapture
// (con person_id fijo). La báscula es self (health_metrics, sin persona).

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Camera, Loader2, Check, ArrowRight, Scale, AlertCircle, Eye } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { detectCaptureType, DetectorError } from '@/lib/capture/detector/client'
import { previewCapture, processCapture, HttpError } from '@/lib/capture/observations/client'
import { planPersonCapture } from '@/lib/capture/person-capture'
import { assessExtraction } from '@/lib/capture/legibility'
import type { CaptureType, Confidence, DetectorResult } from '@/lib/capture/observations/types'
import { cn } from '@/lib/utils'

type Phase = 'idle' | 'working' | 'review' | 'confirming' | 'done' | 'scale' | 'unsupported' | 'illegible'

interface ErrorState {
  status: number
  message: string
  detail?: string
}

interface PreviewState {
  captureType: CaptureType
  detectorData: DetectorResult
  extracted: Record<string, unknown>
  confidence: Confidence | null
}

const TYPE_LABEL: Partial<Record<CaptureType, string>> = {
  whatsapp_chat: 'WhatsApp',
  whatsapp_web: 'WhatsApp',
  whatsapp_info: 'WhatsApp',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
}

const CONF_META: Record<'high' | 'medium' | 'low' | 'unknown', { label: string; chip: string }> = {
  high: { label: 'confianza alta', chip: 'border-ok/30 bg-ok-soft text-ok-foreground' },
  medium: { label: 'confianza media', chip: 'border-warn/30 bg-warn-soft text-warn-foreground' },
  low: { label: 'confianza baja', chip: 'border-bad/30 bg-bad-soft text-bad-foreground' },
  unknown: { label: 'confianza s/d', chip: 'border-border bg-muted text-muted-foreground' },
}

/** Filas legibles del JSON extraído para el panel de revisión. */
function previewRows(extracted: Record<string, unknown>): { k: string; v: string }[] {
  const rows: { k: string; v: string }[] = []
  for (const [k, val] of Object.entries(extracted)) {
    if (k === 'confidence') continue
    if (val == null) continue
    if (typeof val === 'string') {
      if (val.trim()) rows.push({ k, v: val.length > 140 ? `${val.slice(0, 140)}…` : val })
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      rows.push({ k, v: String(val) })
    } else if (Array.isArray(val) && val.every((x) => typeof x === 'string') && val.length) {
      rows.push({ k, v: (val as string[]).join(', ') })
    }
  }
  return rows.slice(0, 12)
}

export interface AgregarCapturaPanelProps {
  personId: string
  personName: string
}

export function AgregarCapturaPanel({ personId, personName }: AgregarCapturaPanelProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<ErrorState | null>(null)
  const [savedType, setSavedType] = useState<CaptureType | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)

  const reset = useCallback(() => {
    setFile(null)
    setPhase('idle')
    setError(null)
    setSavedType(null)
    setPreview(null)
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null)
    setPhase('idle')
    setError(null)
    setSavedType(null)
    setPreview(null)
  }, [])

  const toError = (e: unknown): ErrorState =>
    e instanceof DetectorError || e instanceof HttpError
      ? { status: e.status, message: e.message, detail: e.detail }
      : { status: 0, message: e instanceof Error ? e.message : String(e) }

  // Persiste lo confirmado (sin re-extraer: confirmedData = lo revisado).
  const persistConfirmed = useCallback(
    async (p: PreviewState) => {
      if (!file) return
      setPhase('confirming')
      setError(null)
      try {
        await processCapture({
          file,
          captureType: p.captureType,
          detectorData: p.detectorData,
          personId,
          confirmedData: p.extracted,
        })
        setSavedType(p.captureType)
        setPhase('done')
        router.refresh()
      } catch (e) {
        setError(toError(e))
        setPhase('review')
      }
    },
    [file, personId, router],
  )

  const run = useCallback(async () => {
    if (!file) return
    setPhase('working')
    setError(null)
    try {
      const detection = await detectCaptureType(file)
      const type = detection.detected.type
      const plan = planPersonCapture(type)

      if (plan.kind === 'scale') {
        setSavedType(type)
        setPhase('scale')
        return
      }
      if (plan.kind === 'unsupported') {
        setSavedType(type)
        setPhase('unsupported')
        return
      }

      // PREVIEW: extrae sin guardar.
      const pv = await previewCapture({ file, captureType: type, detectorData: detection.detected })
      const state: PreviewState = {
        captureType: type,
        detectorData: detection.detected,
        extracted: pv.extracted,
        confidence: pv.confidence,
      }
      setPreview(state)

      // Evaluar legibilidad: ilegible → cortar (no mostrar basura); dudoso →
      // revisar; ok (alta confianza + varios campos) → guardar directo.
      const verdict = assessExtraction(pv.extracted, pv.confidence)
      if (verdict === 'unreadable') {
        setPhase('illegible')
      } else if (verdict === 'ok') {
        await persistConfirmed(state)
      } else {
        setPhase('review')
      }
    } catch (e) {
      setError(toError(e))
      setPhase('idle')
    }
  }, [file, persistConfirmed])

  const working = phase === 'working'
  const confirming = phase === 'confirming'

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-1">
          <Camera size={15} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
            Agregar captura
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Capturando para <span className="font-medium text-foreground">{personName}</span> — se asocia
          directo a su perfil (sin re-seleccionar).
        </p>

        {phase === 'done' ? (
          <div className="space-y-3">
            <div className="rounded-md border border-ok/30 bg-ok-soft p-3 text-xs flex items-center gap-2">
              <Check size={14} strokeWidth={2} className="text-ok flex-shrink-0" aria-hidden="true" />
              <span className="text-ok">
                {savedType && TYPE_LABEL[savedType] ? `Captura de ${TYPE_LABEL[savedType]}` : 'Captura'} guardada
                y asociada a {personName}.
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={reset} className="w-full">
              Agregar otra captura
            </Button>
          </div>
        ) : phase === 'review' || phase === 'confirming' ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Eye size={13} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
              <span className="text-xs text-foreground font-medium">
                Revisá lo extraído antes de guardar
              </span>
              {preview && (
                <Badge variant="outline" className={cn('text-[10px] font-normal', CONF_META[preview.confidence ?? 'unknown'].chip)}>
                  {CONF_META[preview.confidence ?? 'unknown'].label}
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
              La confianza no es alta: confirmá que los datos están bien antes de asociarlos a {personName}.
              Si la extracción salió mal (foto de baja resolución, datos cruzados), descartala.
            </p>

            {preview && (
              <div className="rounded-md border border-border/60 bg-muted/10 p-3 space-y-1">
                {previewRows(preview.extracted).length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">El extractor no devolvió campos legibles.</p>
                ) : (
                  previewRows(preview.extracted).map((r) => (
                    <div key={r.k} className="flex gap-2 text-xs py-0.5 border-b border-border/30 last:border-0">
                      <span className="text-muted-foreground/70 w-28 flex-shrink-0 truncate">{r.k}</span>
                      <span className="text-foreground min-w-0 break-words">{r.v}</span>
                    </div>
                  ))
                )}
              </div>
            )}

            {error && <ApiErrorNotice error={error} className="p-2" />}

            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                size="sm"
                onClick={() => preview && persistConfirmed(preview)}
                disabled={confirming}
                className="w-full sm:w-auto"
              >
                {confirming ? <><Loader2 size={13} className="mr-2 animate-spin" />Guardando…</> : 'Confirmar y guardar'}
              </Button>
              <Button size="sm" variant="ghost" onClick={reset} disabled={confirming} className="w-full sm:w-auto">
                Descartar
              </Button>
            </div>
          </div>
        ) : phase === 'scale' ? (
          <div className="space-y-3">
            <div className="rounded-md border border-warn/30 bg-warn-soft p-3 text-xs flex items-start gap-2">
              <Scale size={14} strokeWidth={1.75} className="text-warn flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-warn/90">
                Esto parece tu báscula. Las métricas corporales van a <span className="font-medium">tu salud</span>,
                no al perfil de {personName}. Usá el flujo de báscula para guardarlas.
              </span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button size="sm" asChild className="w-full sm:w-auto">
                <Link href="/captura/bascula" className="inline-flex items-center justify-center gap-1.5">
                  Ir a captura de báscula
                  <ArrowRight size={13} strokeWidth={1.75} aria-hidden="true" />
                </Link>
              </Button>
              <Button size="sm" variant="outline" onClick={reset} className="w-full sm:w-auto">
                Elegir otra imagen
              </Button>
            </div>
          </div>
        ) : phase === 'unsupported' ? (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/20 p-3 text-xs flex items-start gap-2">
              <AlertCircle size={14} strokeWidth={1.75} className="text-muted-foreground flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-muted-foreground">
                No reconocí un tipo asociable (chat de WhatsApp, perfil de Instagram/LinkedIn).
                Probá con otra imagen.
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={reset} className="w-full">
              Elegir otra imagen
            </Button>
          </div>
        ) : phase === 'illegible' ? (
          <div className="space-y-3">
            <div className="rounded-md border border-warn/30 bg-warn/5 p-3 text-xs flex items-start gap-2">
              <AlertCircle size={14} strokeWidth={1.75} className="text-warn flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-warn-foreground">
                No pude leer bien esta imagen. Probá con una captura más nítida o más cercana —
                las <span className="font-medium">secciones del perfil</span> (no la página entera),
                que la letra se lea grande. No guardé nada.
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={reset} className="w-full">
              Elegir otra imagen
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={onFile}
              disabled={working}
              className="text-sm w-full file:mr-3 file:rounded file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-accent/10 disabled:opacity-50"
            />
            {file && (
              <div className="text-[11px] text-muted-foreground font-mono">
                {file.name} · {(file.size / 1024).toFixed(0)} KB
              </div>
            )}

            {error && <ApiErrorNotice error={error} className="p-2" />}

            <Button size="sm" onClick={run} disabled={!file || working} className="w-full">
              {working ? (
                <>
                  <Loader2 size={14} className="mr-2 animate-spin" />
                  Detectando…
                </>
              ) : (
                'Subir y revisar'
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
