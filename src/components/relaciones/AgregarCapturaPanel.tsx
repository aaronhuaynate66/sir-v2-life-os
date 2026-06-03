'use client'
// SIR V2 — AgregarCapturaPanel: captura EN CONTEXTO de una persona.
//
// Aaron quería subir una captura desde el detalle de la persona y que se
// asocie DIRECTO a ella, sin re-seleccionar en /captura. Acá la persona está
// FIJA: subís la imagen, el detector reconoce el tipo y se procesa hacia el
// perfil de ESTA persona — sin matcher.
//
// MULTI-IMAGEN (mismo perfil): podés subir VARIAS capturas del mismo perfil de
// una sola vez (p. ej. 3 screenshots de distintas secciones de un LinkedIn).
// Cada imagen pasa por el pipeline existente (detect → preview Vision → assess)
// con UNA llamada por imagen (respeta maxDuration de Vercel, sin riesgo de
// timeout), y luego CONSOLIDAMOS lo extraído en UN solo objeto (lib/capture/
// merge/consolidateBatch, puro). Se persiste como UNA sola observación vía el
// path confirmed_data ya existente. El guard de legibilidad se aplica POR
// imagen: si una es ilegible se omite y se avisa, las demás se procesan.
//
// REVIEW-BEFORE-SAVE (hito 2): primero hacemos un PREVIEW (extrae sin guardar).
// Una sola imagen con confianza alta → guarda directo. Si hubo consolidación
// (≥2) o algún descarte, o la confianza es media/baja → mostramos los campos
// consolidados para revisar y CONFIRMAR o DESCARTAR antes de persistir.
//
// Reusa el pipeline existente: detectCaptureType + previewCapture/processCapture
// (con person_id fijo). La báscula es self (health_metrics, sin persona).

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Camera, Loader2, Check, ArrowRight, Scale, AlertCircle, Eye, FileText, ClipboardPaste, X, Images } from 'lucide-react'

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
import { consolidateBatch, type BatchItemInput } from '@/lib/capture/merge/consolidate'
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

/** Resumen de qué pasó con cada imagen del lote (para la UI de revisión). */
interface BatchSummary {
  /** Capturas que entraron en el merge consolidado. */
  used: number
  /** Omitidas por ilegibles. */
  illegible: number
  /** Eran báscula (van a salud, no al perfil). */
  scale: number
  /** Sin extractor asociable a persona. */
  unsupported: number
  /** Usables pero de otro tipo distinto al consolidado. */
  mismatch: number
  /** Fallaron en detect/preview. */
  errored: number
  total: number
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
  /** Solo en source='image': la imagen REPRESENTATIVA a archivar (la primera
   *  usable del lote). Una observación = una imagen fuente. */
  file?: File
  /** Solo en source='image' multi: resumen de la consolidación del lote. */
  batch?: BatchSummary
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

/** Clave estable de un File para deduplicar la selección. */
function fileKey(f: File): string {
  return `${f.name}:${f.size}:${f.lastModified}`
}

/** Procesa `items` con concurrencia acotada (no saturar Vision/rate-limit ni
 *  bloquear demasiado). Cada worker corre secuencialmente dentro de su carril. */
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
  // Multi-imagen: varias capturas del MISMO perfil en un solo envío.
  const [files, setFiles] = useState<File[]>([])
  const [pastedText, setPastedText] = useState('')
  // Tipo del perfil pegado: se autodetecta del texto, con override manual.
  const [textType, setTextType] = useState<TextProfileType>('linkedin')
  const [textTypeTouched, setTextTypeTouched] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<ErrorState | null>(null)
  const [savedType, setSavedType] = useState<CaptureType | null>(null)
  const [savedCount, setSavedCount] = useState<number>(1)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  // Progreso del lote (k de N) mientras se extrae imagen por imagen.
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const reset = useCallback(() => {
    setFiles([])
    setPastedText('')
    setTextTypeTouched(false)
    setPhase('idle')
    setError(null)
    setSavedType(null)
    setSavedCount(1)
    setPreview(null)
    setProgress(null)
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  // Selección MÚLTIPLE: agrega las nuevas a las ya elegidas (dedup por
  // nombre+tamaño+fecha), permitiendo sumar de a tandas antes de procesar.
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
    setPhase('idle')
    setError(null)
    setSavedType(null)
    setPreview(null)
    // Resetear el input para poder re-seleccionar el mismo archivo si hace falta.
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  const removeFile = useCallback((idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
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
          if (!p.file) {
            setError({ status: 0, message: 'No hay imagen para guardar' })
            setPhase('review')
            return
          }
          await processCapture({
            file: p.file,
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
        setSavedCount(p.batch?.used ?? 1)
        setPhase('done')
        router.refresh()
      } catch (e) {
        setError(toError(e))
        setPhase('review')
      }
    },
    [personId, router, person?.instagramHandle, updatePerson],
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

  // Procesa el LOTE de imágenes (1..N) del MISMO perfil: detect + preview por
  // imagen (una llamada Vision c/u → sin riesgo de timeout), assess de
  // legibilidad por imagen, y consolidación pura en UN solo objeto.
  const runImages = useCallback(async () => {
    if (files.length === 0) return
    setPhase('working')
    setError(null)
    setPreview(null)
    setProgress({ done: 0, total: files.length })

    const detectorById: Record<string, DetectorResult> = {}
    const items: BatchItemInput[] = []
    let done = 0

    await runPool(files, 3, async (file, idx) => {
      const id = String(idx)
      try {
        const detection = await detectCaptureType(file)
        const type = detection.detected.type
        const plan = planPersonCapture(type)
        detectorById[id] = detection.detected
        if (plan.kind !== 'link') {
          items.push({ id, plan: plan.kind, captureType: type })
          return
        }
        const [pv, dims] = await Promise.all([
          previewCapture({ file, captureType: type, detectorData: detection.detected }),
          readImageDims(file),
        ])
        const verdict = assessExtraction(pv.extracted, pv.confidence, { dims, captureType: type })
        items.push({
          id,
          plan: 'link',
          captureType: type,
          extracted: pv.extracted,
          confidence: pv.confidence,
          verdict,
        })
      } catch (e) {
        items.push({
          id,
          plan: 'link',
          captureType: 'unknown',
          error: e instanceof Error ? e.message : String(e),
        })
      } finally {
        done += 1
        setProgress({ done, total: files.length })
      }
    })

    // runPool puede completar fuera de orden → ordenar por índice para que el
    // merge (y la imagen representativa) sea determinístico.
    items.sort((a, b) => Number(a.id) - Number(b.id))

    const batch = consolidateBatch(items)
    const summary: BatchSummary = {
      used: batch.usedIds.length,
      illegible: batch.illegibleIds.length,
      scale: batch.scaleIds.length,
      unsupported: batch.unsupportedIds.length,
      mismatch: batch.mismatchIds.length,
      errored: batch.erroredIds.length,
      total: files.length,
    }

    // Nada usable: elegir el mensaje terminal según qué dominó.
    if (!batch.consolidatedType || !batch.extracted) {
      // Si TODAS fueron del mismo callejón sin salida, mostramos su mensaje;
      // si hubo ilegibles, priorizamos el aviso de ilegibilidad (lo más común).
      if (summary.errored > 0 && summary.illegible === 0 && summary.scale === 0 && summary.unsupported === 0) {
        setError({ status: 0, message: 'No se pudo procesar ninguna imagen', detail: `${summary.errored} fallaron.` })
        setPhase('idle')
        return
      }
      setPreview({
        source: 'image',
        captureType: 'unknown',
        detectorData: { type: 'unknown', confidence: 'low', reasoning: '', suggestedPersonName: null },
        extracted: {},
        confidence: null,
        batch: summary,
      })
      if (summary.illegible > 0) setPhase('illegible')
      else if (summary.scale >= summary.unsupported && summary.scale > 0) setPhase('scale')
      else setPhase('unsupported')
      return
    }

    const repId = batch.usedIds[0]
    const repFile = files[Number(repId)]
    const state: PreviewState = {
      source: 'image',
      captureType: batch.consolidatedType,
      detectorData: detectorById[repId] ?? {
        type: batch.consolidatedType,
        confidence: batch.confidence ?? 'medium',
        reasoning: '',
        suggestedPersonName: null,
      },
      extracted: batch.extracted,
      confidence: batch.confidence,
      file: repFile,
      batch: summary,
    }
    setPreview(state)

    // Una sola imagen, sin nada omitido y veredicto 'ok' → guardar directo
    // (paridad EXACTA con la captura simple de antes). Cualquier consolidación
    // (≥2) o descarte → siempre mostrar revisión.
    const repItem = items.find((i) => i.id === repId)
    const singleClean =
      files.length === 1 &&
      summary.used === 1 &&
      summary.illegible === 0 &&
      summary.scale === 0 &&
      summary.unsupported === 0 &&
      summary.mismatch === 0 &&
      summary.errored === 0
    if (singleClean && repItem?.verdict === 'ok') {
      await persistConfirmed(state)
      return
    }
    setPhase('review')
  }, [files, persistConfirmed])

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
                {savedType && TYPE_LABEL[savedType] ? `Captura de ${TYPE_LABEL[savedType]}` : 'Captura'}
                {savedCount > 1 ? ` (consolidada de ${savedCount} imágenes)` : ''} guardada
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

            {/* Resumen de consolidación del lote (solo multi-imagen / descartes). */}
            {preview?.batch && <BatchSummaryNote batch={preview.batch} />}

            <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
              {preview?.batch && preview.batch.used > 1 ? (
                <>Combiné {preview.batch.used} capturas en un solo perfil. Confirmá que los datos están bien antes de asociarlos a {personName}.</>
              ) : (
                <>La confianza no es alta: confirmá que los datos están bien antes de asociarlos a {personName}.</>
              )}{' '}
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
                Elegir otras imágenes
              </Button>
            </div>
          </div>
        ) : phase === 'unsupported' ? (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/20 p-3 text-xs flex items-start gap-2">
              <AlertCircle size={14} strokeWidth={1.75} className="text-muted-foreground flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-muted-foreground">
                No reconocí un tipo asociable (chat de WhatsApp, perfil de Instagram/LinkedIn).
                Probá con otras imágenes.
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={reset} className="w-full">
              Elegir otras imágenes
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
                    {preview?.batch && preview.batch.total > 1
                      ? `Ninguna de las ${preview.batch.total} imágenes se pudo leer bien. `
                      : 'No pude leer bien esta imagen. '}
                    Probá con capturas más nítidas o más cercanas —
                    las <span className="font-medium">secciones del perfil</span> (no la página entera),
                    que la letra se lea grande. Tip: pegá el <span className="font-medium">texto</span> del
                    perfil, es más confiable. No guardé nada.
                  </>
                )}
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={reset} className="w-full">
              {preview?.source === 'text' ? 'Volver a intentar' : 'Elegir otras imágenes'}
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
                label="Subir imágenes"
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
                <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                  Podés subir <span className="font-medium text-foreground">varias capturas del mismo perfil</span>{' '}
                  a la vez (distintas secciones de un LinkedIn/Instagram): se combinan en un solo perfil.
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

                {/* Imágenes seleccionadas: lista con tamaño y quitar. */}
                {files.length > 0 && (
                  <div className="rounded-md border border-border/60 bg-muted/10 divide-y divide-border/30">
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

                {/* Progreso del lote mientras se extrae. */}
                {working && progress && (
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                    <span>Procesando imagen {Math.min(progress.done + 1, progress.total)} de {progress.total}…</span>
                  </div>
                )}

                {error && <ApiErrorNotice error={error} className="p-2" />}

                <Button size="sm" onClick={runImages} disabled={files.length === 0 || working} className="w-full">
                  {working ? (
                    <>
                      <Loader2 size={14} className="mr-2 animate-spin" />
                      Procesando…
                    </>
                  ) : files.length > 1 ? (
                    `Subir y combinar ${files.length} imágenes`
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

/** Línea-resumen de qué pasó con el lote (consolidadas + omitidas). */
function BatchSummaryNote({ batch }: { batch: BatchSummary }) {
  const skipped: string[] = []
  if (batch.illegible > 0) skipped.push(`${batch.illegible} ilegible${batch.illegible > 1 ? 's' : ''}`)
  if (batch.mismatch > 0) skipped.push(`${batch.mismatch} de otro tipo`)
  if (batch.scale > 0) skipped.push(`${batch.scale} de báscula`)
  if (batch.unsupported > 0) skipped.push(`${batch.unsupported} no soportada${batch.unsupported > 1 ? 's' : ''}`)
  if (batch.errored > 0) skipped.push(`${batch.errored} con error`)

  if (batch.total <= 1 && skipped.length === 0) return null

  return (
    <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-2 text-[11px] text-muted-foreground flex items-start gap-2">
      <Images size={13} strokeWidth={1.75} className="text-muted-foreground/60 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <span>
        Consolidé <span className="font-medium text-foreground">{batch.used}</span> de {batch.total} capturas.
        {skipped.length > 0 && <> Omití: {skipped.join(', ')}.</>}
      </span>
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
        'inline-flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors disabled:opacity-50',
        active ? 'bg-accent/15 text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
