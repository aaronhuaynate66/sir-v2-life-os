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
import { Camera, Loader2, Check, ArrowRight, Scale, AlertCircle, Eye, FileText, ClipboardPaste } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { detectCaptureType, DetectorError } from '@/lib/capture/detector/client'
import {
  previewCapture,
  processCapture,
  previewCaptureFromText,
  processCaptureFromText,
  HttpError,
} from '@/lib/capture/observations/client'
import { planPersonCapture } from '@/lib/capture/person-capture'
import { resolveInstagramAutoLink } from '@/lib/social/links'
import { useRelationshipStore } from '@/stores'
import { assessExtraction, type ImageDims } from '@/lib/capture/legibility'
import {
  detectCaptureTypeFromText,
  detectorResultFromText,
  type TextProfileType,
} from '@/lib/capture/text/detectFromText'
import type { CaptureType, Confidence, DetectorResult } from '@/lib/capture/observations/types'
import { cn } from '@/lib/utils'

type Phase = 'idle' | 'working' | 'review' | 'confirming' | 'done' | 'scale' | 'unsupported' | 'illegible'
type Mode = 'text' | 'image'

interface ErrorState {
  status: number
  message: string
  detail?: string
}

interface PreviewState {
  /** De dónde salió: texto pegado (confiable) o imagen (Visión). */
  source: Mode
  captureType: CaptureType
  detectorData: DetectorResult
  extracted: Record<string, unknown>
  confidence: Confidence | null
  /** Solo en source='text': el texto pegado, para persistir al confirmar. */
  text?: string
}

const TEXT_TYPE_LABEL: Record<TextProfileType, string> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
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

/** Mide las dimensiones naturales de la imagen original (señal de legibilidad
 *  modelo-independiente). Graceful: null si el browser no puede decodificar. */
async function readImageDims(file: File): Promise<ImageDims | null> {
  try {
    const bmp = await createImageBitmap(file)
    const dims = { width: bmp.width, height: bmp.height }
    bmp.close()
    return dims
  } catch {
    return null
  }
}

export interface AgregarCapturaPanelProps {
  personId: string
  personName: string
}

export function AgregarCapturaPanel({ personId, personName }: AgregarCapturaPanelProps) {
  const router = useRouter()
  // Para auto-vincular el Instagram extraído al perfil (paridad V1): el handle
  // y su enlace se cargan SOLOS tras escanear, sin re-tipear.
  const person = useRelationshipStore((s) => s.people.find((p) => p.id === personId))
  const updatePerson = useRelationshipStore((s) => s.updatePerson)
  const inputRef = useRef<HTMLInputElement>(null)
  // Modo por defecto: TEXTO pegado (la vía confiable, sin OCR ilegible). La
  // imagen sigue disponible como alternativa.
  const [mode, setMode] = useState<Mode>('text')
  const [file, setFile] = useState<File | null>(null)
  const [pastedText, setPastedText] = useState('')
  // Tipo del perfil pegado: se autodetecta del texto, con override manual.
  const [textType, setTextType] = useState<TextProfileType>('linkedin')
  const [textTypeTouched, setTextTypeTouched] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<ErrorState | null>(null)
  const [savedType, setSavedType] = useState<CaptureType | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)

  const reset = useCallback(() => {
    setFile(null)
    setPastedText('')
    setTextTypeTouched(false)
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

  // Al pegar/tipear texto: si el usuario no fijó el tipo a mano, lo
  // autodetectamos por marcadores (LinkedIn vs Instagram).
  const onPastedTextChange = useCallback(
    (value: string) => {
      setPastedText(value)
      setError(null)
      if (!textTypeTouched) {
        const d = detectCaptureTypeFromText(value)
        if (d.type !== 'unknown') setTextType(d.type)
      }
    },
    [textTypeTouched],
  )

  const toError = (e: unknown): ErrorState =>
    e instanceof DetectorError || e instanceof HttpError
      ? { status: e.status, message: e.message, detail: e.detail }
      : { status: 0, message: e instanceof Error ? e.message : String(e) }

  // Persiste lo confirmado (sin re-extraer: confirmedData = lo revisado).
  // Rutea por origen: texto → processCaptureFromText; imagen → processCapture.
  const persistConfirmed = useCallback(
    async (p: PreviewState) => {
      setPhase('confirming')
      setError(null)
      try {
        if (p.source === 'text') {
          await processCaptureFromText({
            text: p.text ?? '',
            captureType: p.captureType,
            detectorData: p.detectorData,
            personId,
            confirmedData: p.extracted,
          })
        } else {
          if (!file) {
            setError({ status: 0, message: 'No hay imagen para guardar' })
            setPhase('review')
            return
          }
          await processCapture({
            file,
            captureType: p.captureType,
            detectorData: p.detectorData,
            personId,
            confirmedData: p.extracted,
          })
        }
        // Paridad V1: si fue una captura de Instagram y la persona aún no tiene
        // handle, lo cargamos SOLO desde lo extraído (arma el link automático en
        // "Redes & social"). updatePerson → store + sync a DB (idempotente). No
        // pisa un handle ya cargado.
        if (p.captureType === 'instagram') {
          const autoHandle = resolveInstagramAutoLink(person?.instagramHandle, p.extracted)
          if (autoHandle) {
            updatePerson(personId, {
              instagramHandle: autoHandle,
              updatedAt: new Date().toISOString(),
            })
          }
        }
        setSavedType(p.captureType)
        setPhase('done')
        router.refresh()
      } catch (e) {
        setError(toError(e))
        setPhase('review')
      }
    },
    [file, personId, router, person?.instagramHandle, updatePerson],
  )

  // Procesa TEXTO pegado: detecta tipo (override del usuario o autodetección),
  // extrae sin Visión, comparte el flujo review-before-save.
  const runText = useCallback(async () => {
    const text = pastedText.trim()
    if (!text) return
    setPhase('working')
    setError(null)
    try {
      const captureType: CaptureType = textType
      const detectorData: DetectorResult = {
        ...detectorResultFromText(text, textType),
        type: captureType,
      }
      const pv = await previewCaptureFromText({ text, captureType, detectorData })
      const state: PreviewState = {
        source: 'text',
        captureType,
        detectorData,
        extracted: pv.extracted,
        confidence: pv.confidence,
        text,
      }
      setPreview(state)
      // Texto = fuente confiable; igual pasa por assess (sin dims): si el
      // extractor reporta confianza baja/ningún campo, va a revisión.
      const verdict = assessExtraction(pv.extracted, pv.confidence, { captureType })
      if (verdict === 'unreadable') setPhase('illegible')
      else if (verdict === 'ok') await persistConfirmed(state)
      else setPhase('review')
    } catch (e) {
      setError(toError(e))
      setPhase('idle')
    }
  }, [pastedText, textType, persistConfirmed])

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

      // PREVIEW (extrae sin guardar) + medir dimensiones de la imagen original
      // en paralelo (señal de legibilidad modelo-independiente).
      const [pv, dims] = await Promise.all([
        previewCapture({ file, captureType: type, detectorData: detection.detected }),
        readImageDims(file),
      ])
      const state: PreviewState = {
        source: 'image',
        captureType: type,
        detectorData: detection.detected,
        extracted: pv.extracted,
        confidence: pv.confidence,
      }
      setPreview(state)

      // Evaluar legibilidad: ilegible → cortar (no mostrar basura); dudoso →
      // revisar; ok → guardar directo. Combina confianza + flag imageLegible
      // del extractor + dimensiones (página entera = letra diminuta, aunque
      // el LLM jure confianza alta).
      const verdict = assessExtraction(pv.extracted, pv.confidence, { dims, captureType: type })
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
                {preview?.source === 'text' ? (
                  <>
                    No pude extraer datos claros de ese texto. Asegurate de pegar el contenido del{' '}
                    <span className="font-medium">perfil</span> (nombre, headline, experiencia…). No guardé nada.
                  </>
                ) : (
                  <>
                    No pude leer bien esta imagen. Probá con una captura más nítida o más cercana —
                    las <span className="font-medium">secciones del perfil</span> (no la página entera),
                    que la letra se lea grande. Tip: pegá el <span className="font-medium">texto</span> del
                    perfil, es más confiable. No guardé nada.
                  </>
                )}
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={reset} className="w-full">
              {preview?.source === 'text' ? 'Volver a intentar' : 'Elegir otra imagen'}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Selector de modo: TEXTO (confiable) vs IMAGEN. */}
            <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
              <ModeTab
                active={mode === 'text'}
                onClick={() => setMode('text')}
                icon={<FileText size={12} strokeWidth={1.75} aria-hidden="true" />}
                label="Pegar texto"
                disabled={working}
              />
              <ModeTab
                active={mode === 'image'}
                onClick={() => setMode('image')}
                icon={<Camera size={12} strokeWidth={1.75} aria-hidden="true" />}
                label="Subir imagen"
                disabled={working}
              />
            </div>

            {mode === 'text' ? (
              <>
                <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                  Pegá el texto del perfil (LinkedIn/Instagram). Es la vía{' '}
                  <span className="font-medium text-foreground">confiable</span>: se lee exacto, sin
                  los errores de las capturas de página entera.
                </p>
                <textarea
                  value={pastedText}
                  onChange={(e) => onPastedTextChange(e.target.value)}
                  disabled={working}
                  rows={6}
                  placeholder="Pegá acá el texto del perfil — nombre, headline, experiencia, ubicación…"
                  className="w-full rounded-md border border-border bg-background p-2.5 text-sm leading-relaxed disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-accent/40"
                />
                {/* Tipo detectado, con override. */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-muted-foreground/70">Tipo:</span>
                  {(['linkedin', 'instagram'] as TextProfileType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={working}
                      onClick={() => {
                        setTextType(t)
                        setTextTypeTouched(true)
                      }}
                      className={cn(
                        'rounded-full border px-2.5 py-0.5 text-[11px] transition-colors disabled:opacity-50',
                        textType === t
                          ? 'border-accent/50 bg-accent/10 text-foreground'
                          : 'border-border text-muted-foreground hover:border-accent/40',
                      )}
                      aria-pressed={textType === t}
                    >
                      {TEXT_TYPE_LABEL[t]}
                    </button>
                  ))}
                  {!textTypeTouched && pastedText.trim().length > 0 && (
                    <span className="text-[10px] text-muted-foreground/50">autodetectado</span>
                  )}
                </div>

                {error && <ApiErrorNotice error={error} className="p-2" />}

                <Button
                  size="sm"
                  onClick={runText}
                  disabled={pastedText.trim().length === 0 || working}
                  className="w-full"
                >
                  {working ? (
                    <>
                      <Loader2 size={14} className="mr-2 animate-spin" />
                      Procesando…
                    </>
                  ) : (
                    <>
                      <ClipboardPaste size={14} strokeWidth={1.75} className="mr-2" aria-hidden="true" />
                      Procesar texto
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
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
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
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
        'inline-flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors disabled:opacity-50',
        active ? 'bg-accent/15 text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
