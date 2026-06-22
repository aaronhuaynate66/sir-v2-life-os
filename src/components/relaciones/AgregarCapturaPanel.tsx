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
import { track, trackCapture, EVENTS } from '@/lib/analytics/track'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Camera, Loader2, Check, ArrowRight, Scale, AlertCircle, Eye, FileText, ClipboardPaste, X, Images, MessagesSquare, Upload, CalendarHeart, Repeat } from 'lucide-react'

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
import type { NoteExtract } from '@/lib/capture/note/notePrompt'
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
import {
  readExportText,
  interpretChunk,
  persistWhatsAppExport,
  getLastImportedISO,
  archiveConversation,
} from '@/lib/capture/whatsapp/export/client'
import { parseWhatsAppExport, isWhatsAppExport } from '@/lib/capture/whatsapp/export/parse'
import { transcribeExportAudios } from '@/lib/capture/whatsapp/export/audioClient'
import { sliceParsedSince, incrementalSummary } from '@/lib/capture/whatsapp/export/incremental'
import { extractCalls, callLabel, type ParsedCall } from '@/lib/capture/whatsapp/export/calls'
import { chunkConversation } from '@/lib/capture/whatsapp/export/chunk'
import {
  consolidateInterpretations,
  buildExportObservationData,
} from '@/lib/capture/whatsapp/export/consolidate'
import type { ChunkInterpretation, ConsolidatedExport, ExtractedDate } from '@/lib/capture/whatsapp/export/types'
import { createPersonLog } from './person-logs/client'
import { parseLocalDate } from '@/lib/dates/parseLocalDate'
import type { CaptureType, Confidence, DetectorResult } from '@/lib/capture/observations/types'
import type { Person, SpecialDate } from '@/types'
import { cn } from '@/lib/utils'

type Phase = 'idle' | 'working' | 'review' | 'confirming' | 'done' | 'scale' | 'unsupported' | 'illegible' | 'noteReview'
type Mode = 'text' | 'image' | 'whatsapp'

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
  /** De dónde salió: texto pegado (confiable), imagen (Visión) o export WhatsApp. */
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
  /** Solo en source='whatsapp': el `data` de la observación a persistir +
   *  la lectura consolidada (para la UI de revisión) + nº de mensajes. */
  exportData?: Record<string, unknown>
  /** Solo whatsapp: texto crudo del export, para archivar (bitácora). */
  rawText?: string
  consolidated?: ConsolidatedExport
  messageCount?: number
  blocksUsed?: number
  /** Solo whatsapp: llamadas NUEVAS extraídas del export (para loguearlas al confirmar). */
  calls?: ParsedCall[]
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
  /** Modo inicial del selector (text/image/whatsapp). Default 'text'. Lo usa el
   *  flujo "importar chat desde /captura" para aterrizar directo en WhatsApp. */
  defaultMode?: 'text' | 'image' | 'whatsapp'
}

export function AgregarCapturaPanel({ personId, personName, defaultMode }: AgregarCapturaPanelProps) {
  const router = useRouter()
  // Para auto-vincular el Instagram extraído al perfil (paridad V1): el handle
  // y su enlace se cargan SOLOS tras escanear, sin re-tipear.
  const person = useRelationshipStore((s) => s.people.find((p) => p.id === personId))
  const updatePerson = useRelationshipStore((s) => s.updatePerson)
  const inputRef = useRef<HTMLInputElement>(null)
  const waInputRef = useRef<HTMLInputElement>(null)
  // Modo por defecto: TEXTO pegado (la vía confiable, sin OCR ilegible). La
  // imagen y el export de WhatsApp están como alternativas.
  const [mode, setMode] = useState<Mode>(defaultMode ?? 'text')
  // Multi-imagen: varias capturas del MISMO perfil en un solo envío.
  const [files, setFiles] = useState<File[]>([])
  const [pastedText, setPastedText] = useState('')
  // Export de WhatsApp: el archivo .txt/.zip de la conversación.
  const [waFile, setWaFile] = useState<File | null>(null)
  const [transcribeAudios, setTranscribeAudios] = useState(false)
  const [audioProgress, setAudioProgress] = useState<{ done: number; total: number } | null>(null)
  // Fechas extraídas que el usuario eligió agregar a "Fechas importantes".
  const [selectedDateIdx, setSelectedDateIdx] = useState<Set<number>>(new Set())
  // Tipo del perfil pegado: se autodetecta del texto, con override manual.
  const [textType, setTextType] = useState<TextProfileType>('linkedin')
  const [textTypeTouched, setTextTypeTouched] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<ErrorState | null>(null)
  const [savedType, setSavedType] = useState<CaptureType | null>(null)
  const [savedCount, setSavedCount] = useState<number>(1)
  // Resumen de lo guardado cuando fue un export de WhatsApp (mensaje a medida).
  const [savedExport, setSavedExport] = useState<{ messageCount: number; datesAdded: number; alreadyImported?: boolean; sinceISO?: string | null } | null>(null)
  const [noteData, setNoteData] = useState<NoteExtract | null>(null)
  const [savedNote, setSavedNote] = useState<NoteExtract | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  // Progreso del lote (k de N) mientras se extrae imagen por imagen / bloque a bloque.
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const reset = useCallback(() => {
    setFiles([])
    setPastedText('')
    setWaFile(null)
    setAudioProgress(null)
    setSelectedDateIdx(new Set())
    setTextTypeTouched(false)
    setPhase('idle')
    setError(null)
    setSavedType(null)
    setNoteData(null)
    setSavedNote(null)
    setSavedCount(1)
    setSavedExport(null)
    setPreview(null)
    setProgress(null)
    if (inputRef.current) inputRef.current.value = ''
    if (waInputRef.current) waInputRef.current.value = ''
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

  const toError = (e: unknown): ErrorState => {
    if (e instanceof DetectorError || e instanceof HttpError) {
      return { status: e.status, message: e.message, detail: e.detail }
    }
    // ApiError-like (clientes nuevos lanzan { status, message, detail } plano).
    if (e && typeof e === 'object' && 'status' in e && typeof (e as { status: unknown }).status === 'number') {
      const a = e as { status: number; message?: string; detail?: string }
      return { status: a.status, message: a.message ?? `HTTP ${a.status}`, detail: a.detail }
    }
    return { status: 0, message: e instanceof Error ? e.message : String(e) }
  }

  // Persiste lo confirmado (sin re-extraer: confirmedData = lo revisado).
  // Rutea por origen: texto → processCaptureFromText; imagen → processCapture.
  const persistConfirmed = useCallback(
    async (p: PreviewState) => {
      setPhase('confirming')
      setError(null)
      try {
        if (p.source === 'whatsapp') {
          if (!p.exportData) {
            setError({ status: 0, message: 'No hay conversación para guardar' })
            setPhase('review')
            return
          }
          // 1. Persistir la conversación como observación whatsapp_chat.
          await persistWhatsAppExport({ personId, data: p.exportData })
          track(EVENTS.exportUploaded, { messages: p.messageCount ?? 0, blocks: p.blocksUsed ?? 0 })


          // 2. Tono/calidad → reciprocidad: registrar UNA interacción con la
          //    calidad inferida (best-effort, no bloquea el guardado).
          const quality = p.consolidated?.interactionQuality
          if (typeof quality === 'number' && quality >= 1 && quality <= 5) {
            try {
              await createPersonLog({
                personId,
                kind: 'interaction',
                value: quality,
                note: `Importado del export de WhatsApp · ${p.messageCount ?? 0} mensajes`,
              })
            } catch {
              /* no fatal: la observación ya quedó guardada */
            }
          }

          // 2b. Llamadas (voz/video/perdidas) → interacción con su fecha/hora
          //     real, para que aparezcan en el día-X y la bitácora. Tono neutral
          //     (3): la llamada es CONTACTO; el dato fino va en la nota. Cap 30.
          for (const c of (p.calls ?? []).slice(0, 30)) {
            try {
              await createPersonLog({
                personId,
                kind: 'interaction',
                value: 3,
                note: `${callLabel(c)}${c.time ? ` · ${c.time}` : ''}`,
                ...(c.iso ? { loggedAt: c.iso } : {}),
              })
            } catch { /* best-effort */ }
          }

          // 3. Fechas elegidas → Fechas importantes (people.special_dates).
          let datesAdded = 0
          const dates = p.consolidated?.dates ?? []
          const toAdd: SpecialDate[] = []
          dates.forEach((d, i) => {
            if (!selectedDateIdx.has(i) || !d.dateISO) return
            const dateStr = d.dateISO.slice(0, 10)
            if (!parseLocalDate(dateStr)) return
            toAdd.push({
              id: crypto.randomUUID(),
              label: d.label,
              date: dateStr,
              recurring: d.recurring,
            })
          })
          if (toAdd.length > 0 && person) {
            updatePerson(personId, {
              specialDates: [...(person.specialDates ?? []), ...toAdd],
              updatedAt: new Date().toISOString(),
            })
            datesAdded = toAdd.length
          }

          setSavedType('whatsapp_chat')
          setSavedExport({ messageCount: p.messageCount ?? 0, datesAdded })
          setPhase('done')
          router.refresh()
          return
        }
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
        trackCapture(EVENTS.captureSaved, { capture_type: p.captureType, surface: 'ficha', linked: true })
        setSavedType(p.captureType)
        setSavedCount(p.batch?.used ?? 1)
        setPhase('done')
        router.refresh()
      } catch (e) {
        setError(toError(e))
        setPhase('review')
      }
    },
    [personId, router, person, updatePerson, selectedDateIdx],
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
      if (verdict === 'unreadable') {
        // Autodetect: no era un perfil → lo leemos como NOTA libre.
        try {
          const res = await fetch('/api/capture/note', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
          })
          if (res.ok) {
            const { extract } = (await res.json()) as { extract: NoteExtract }
            setNoteData(extract)
            setPhase('noteReview')
            return
          }
        } catch {
          // cae al estado 'illegible' (perfil) si la nota tampoco da nada
        }
        setPhase('illegible')
      } else if (verdict === 'ok') await persistConfirmed(state)
      else setPhase('review')
    } catch (e) {
      setError(toError(e))
      setPhase('idle')
    }
  }, [pastedText, textType, persistConfirmed])

  // Guarda la NOTA revisada: aplica los datos estructurados a la ficha y adjunta
  // el resumen a las notas de la persona (updatePerson → store + sync DB).
  const confirmNote = useCallback(() => {
    if (!noteData) return
    setPhase('working')
    try {
      const patch: Partial<Person> = { updatedAt: new Date().toISOString() }
      if (noteData.birthDate) patch.birthDate = noteData.birthDate
      if (noteData.location && !person?.location) patch.location = noteData.location
      if (noteData.summary) {
        const stamp = new Date().toLocaleDateString('es-PE')
        const line = `[${stamp}] ${noteData.summary}`
        const prev = (person?.notes ?? '').trim()
        patch.notes = prev ? `${prev}\n${line}` : line
      }
      // Promover fechas detectadas (cumpleaños, casamiento, etc.) a "Fechas
      // importantes" (special_dates), dedup por label+fecha contra lo existente.
      if (noteData.specialDates && noteData.specialDates.length > 0) {
        const existing = person?.specialDates ?? []
        const key = (l: string, d: string) => `${l.trim().toLowerCase()}|${d}`
        const seen = new Set(existing.map((sd) => key(sd.label, sd.date)))
        const toAdd = noteData.specialDates
          .filter((sd) => !seen.has(key(sd.label, sd.date)))
          .map((sd) => ({
            id: (globalThis.crypto?.randomUUID?.() ?? `sd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
            label: sd.label,
            date: sd.date,
            recurring: sd.recurring,
          }))
        if (toAdd.length > 0) patch.specialDates = [...existing, ...toAdd]
      }
      updatePerson(personId, patch)
      setSavedNote(noteData)
      setPhase('done')
      router.refresh()
    } catch (e) {
      setError(toError(e))
      setPhase('noteReview')
    }
  }, [noteData, person, personId, updatePerson, router])

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

    track(EVENTS.captureStarted, { surface: 'ficha', files: files.length })
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

  // Procesa el EXPORT de WhatsApp (.txt / .zip) de la conversación con esta
  // persona. Texto FIEL (no OCR): extrae el chat (zip → client-side, sin subir
  // media), lo parte en bloques y deriva una interpretación POR BLOQUE (una
  // llamada LLM corta c/u, con progreso → cero riesgo de timeout). Consolida en
  // UNA observación whatsapp_chat. Siempre pasa por revisión (es una
  // consolidación grande + el usuario elige qué fechas guardar).
  const runWhatsAppExport = useCallback(async () => {
    if (!waFile) return
    setPhase('working')
    setError(null)
    setPreview(null)
    setProgress(null)
    try {
      // 1. Texto del chat (.txt directo / .zip extraído sin subir la media).
      let text = await readExportText(waFile)
      // 1a. Marcador incremental ANTES de transcribir: solo transcribimos las
      //     notas de voz POSTERIORES a lo ya importado → resubir el mismo zip
      //     no re-transcribe lo viejo (cero gasto repetido de Whisper).
      const lastImportedISO = await getLastImportedISO(personId)
      // 1b. Notas de voz: si está activado y es un .zip, transcribimos las
      //     recientes-y-nuevas y las inyectamos como texto antes de parsear.
      if (transcribeAudios && /\.zip$/i.test(waFile.name)) {
        setAudioProgress({ done: 0, total: 0 })
        try {
          const r = await transcribeExportAudios(waFile, text, { cap: 25, sinceISO: lastImportedISO, onProgress: (done, total) => setAudioProgress({ done, total }) })
          text = r.text
        } catch { /* best-effort: seguimos con el texto sin audios */ }
        setAudioProgress(null)
      }
      const parsed = parseWhatsAppExport(text)
      if (!isWhatsAppExport(text) || parsed.messages.length === 0) {
        setPreview({
          source: 'whatsapp',
          captureType: 'whatsapp_chat',
          detectorData: { type: 'whatsapp_chat', confidence: 'low', reasoning: '', suggestedPersonName: null },
          extracted: {},
          confidence: null,
        })
        setPhase('illegible')
        return
      }

      // 1a-bis. Archivar el CRUDO SIEMPRE (registro completo + búsqueda), aunque
      //   el import sea "duplicado" y no haya nada nuevo. Best-effort.
      void archiveConversation({ personId, rawText: text, dateFirst: parsed.firstISO, dateLast: parsed.lastISO, messageCount: parsed.messages.length })

      // 1b. INCREMENTAL: ¿hasta qué fecha ya importé a esta persona? Me quedo
      //     solo con los mensajes nuevos (re-subir el mismo chat es seguro;
      //     un chat que creció procesa solo la cola nueva). Cero renombrar.
      const incr = incrementalSummary(parsed, lastImportedISO)
      if (incr.isDuplicate) {
        setSavedType('whatsapp_chat')
        setSavedExport({ messageCount: 0, datesAdded: 0, alreadyImported: true, sinceISO: lastImportedISO })
        setPhase('done')
        return
      }
      const fresh = sliceParsedSince(parsed, lastImportedISO)

      // 2. Partir en bloques + interpretar bloque a bloque (concurrencia acotada).
      const chunks = chunkConversation(fresh.messages)
      setProgress({ done: 0, total: chunks.length })
      const parts: (ChunkInterpretation | null)[] = new Array(chunks.length).fill(null)
      let done = 0
      await runPool(chunks, 3, async (chunk, idx) => {
        try {
          parts[idx] = await interpretChunk({
            chunkText: chunk.text,
            personName,
            index: idx,
            total: chunks.length,
          })
        } catch {
          parts[idx] = null
        } finally {
          done += 1
          setProgress({ done, total: chunks.length })
        }
      })

      const valid = parts.filter((p): p is ChunkInterpretation => p !== null)
      if (valid.length === 0) {
        setError({
          status: 0,
          message: 'No se pudo interpretar la conversación',
          detail: 'Ningún bloque devolvió resultado. Reintentá en unos segundos.',
        })
        setPhase('idle')
        return
      }

      // 3. Consolidar + armar el data de la observación whatsapp_chat.
      const consolidated = consolidateInterpretations(valid)
      const exportData = buildExportObservationData(fresh, consolidated, personName)

      // Preseleccionar las fechas con fecha resoluble (las únicas agregables a
      // "Fechas importantes").
      const preselected = new Set<number>()
      consolidated.dates.forEach((d, i) => {
        if (d.dateISO) preselected.add(i)
      })
      setSelectedDateIdx(preselected)

      // Llamadas NUEVAS (voz/video/perdidas) del tramo no importado, con su
      // fecha/hora — se registran como interacción al confirmar.
      const calls = extractCalls(text, lastImportedISO)
      setPreview({
        source: 'whatsapp',
        captureType: 'whatsapp_chat',
        detectorData: {
          type: 'whatsapp_chat',
          confidence: consolidated.confidence,
          reasoning: 'export de WhatsApp (texto fiel)',
          suggestedPersonName: personName,
        },
        extracted: exportData,
        confidence: consolidated.confidence,
        exportData,
        rawText: text,
        consolidated,
        messageCount: fresh.messages.length,
        blocksUsed: valid.length,
        calls,
      })
      setPhase('review')
    } catch (e) {
      setError(toError(e))
      setPhase('idle')
    }
  }, [waFile, personName, personId, transcribeAudios])

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
              {savedNote ? (
                <span className="text-ok">
                  Nota guardada y asociada a {personName}
                  {savedNote.birthDate ? ` · cumpleaños ${savedNote.birthDate} en la ficha` : ''}.
                </span>
              ) : savedExport?.alreadyImported ? (
                <span className="text-ok">
                  Ya tenías importada esta conversación con {personName}
                  {savedExport.sinceISO ? ` hasta el ${savedExport.sinceISO.slice(0, 10)}` : ''}. No
                  había mensajes nuevos, así que no dupliqué nada.
                </span>
              ) : savedExport ? (
                <span className="text-ok">
                  Conversación de WhatsApp guardada y asociada a {personName} (
                  {savedExport.messageCount} mensajes consolidados
                  {savedExport.datesAdded > 0
                    ? `, ${savedExport.datesAdded} fecha${savedExport.datesAdded > 1 ? 's' : ''} agregada${savedExport.datesAdded > 1 ? 's' : ''}`
                    : ''}
                  ).
                </span>
              ) : (
                <span className="text-ok">
                  {savedType && TYPE_LABEL[savedType] ? `Captura de ${TYPE_LABEL[savedType]}` : 'Captura'}
                  {savedCount > 1 ? ` (consolidada de ${savedCount} imágenes)` : ''} guardada
                  y asociada a {personName}.
                </span>
              )}
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

            {preview?.source === 'whatsapp' && preview.consolidated ? (
              <WhatsAppExportReview
                personName={personName}
                consolidated={preview.consolidated}
                messageCount={preview.messageCount ?? 0}
                blocksUsed={preview.blocksUsed ?? 0}
                selectedDateIdx={selectedDateIdx}
                onToggleDate={(i) =>
                  setSelectedDateIdx((prev) => {
                    const next = new Set(prev)
                    if (next.has(i)) next.delete(i)
                    else next.add(i)
                    return next
                  })
                }
                disabled={confirming}
              />
            ) : (
              <>
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
              </>
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
        ) : phase === 'noteReview' ? (
          <div className="space-y-3">
            <div className="rounded-md border border-brand/30 bg-brand-soft p-3 text-xs">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.07em] text-brand-soft-foreground mb-2">
                <FileText size={12} strokeWidth={1.75} aria-hidden="true" />
                Nota — esto detecté
              </div>
              {noteData?.summary && <p className="text-foreground/90 mb-2 leading-relaxed">{noteData.summary}</p>}
              <ul className="space-y-1">
                {noteData?.birthDate && (
                  <li className="text-muted-foreground">Cumpleaños → <span className="font-mono text-foreground">{noteData.birthDate}</span> (se carga en la ficha)</li>
                )}
                {noteData?.location && <li className="text-muted-foreground">Lugar → <span className="text-foreground">{noteData.location}</span></li>}
                {noteData?.specialDates?.map((sd, i) => (
                  <li key={`sd-${i}`} className="text-[#14b8a6]">📅 {sd.label} → <span className="font-mono">{sd.date}</span>{sd.recurring ? ' (cada año)' : ''} <span className="text-muted-foreground">→ Fechas importantes</span></li>
                ))}
                {noteData?.facts.map((fc, i) => (
                  <li key={i} className="text-muted-foreground">· {fc}</li>
                ))}
              </ul>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={confirmNote} className="flex-1">Guardar en {personName}</Button>
              <Button size="sm" variant="ghost" onClick={reset}>Descartar</Button>
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
                {preview?.source === 'whatsapp' ? (
                  <>
                    No reconocí esto como un <span className="font-medium">export de WhatsApp</span>. Abrí el chat
                    con {personName} → ⋮/menú → <span className="font-medium">Exportar chat</span> y subí el{' '}
                    <span className="font-mono">.txt</span> o el <span className="font-mono">.zip</span> resultante.
                    No guardé nada.
                  </>
                ) : preview?.source === 'text' ? (
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
              {preview?.source === 'text' || preview?.source === 'whatsapp' ? 'Volver a intentar' : 'Elegir otras imágenes'}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Selector de modo: TEXTO (confiable) · IMAGEN · CONVERSACIÓN (export WA). */}
            <div className="inline-flex flex-wrap rounded-md border border-border p-0.5 text-xs">
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
              <ModeTab
                active={mode === 'whatsapp'}
                onClick={() => setMode('whatsapp')}
                icon={<MessagesSquare size={12} strokeWidth={1.75} aria-hidden="true" />}
                label="Conversación"
                disabled={working}
              />
            </div>

            {mode === 'whatsapp' ? (
              <>
                <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                  Subí el <span className="font-medium text-foreground">export del chat de WhatsApp</span> con{' '}
                  {personName}: el <span className="font-mono">.txt</span> (exportá «Sin archivos») o el{' '}
                  <span className="font-mono">.zip</span> (con media — la media se ignora). Es texto{' '}
                  <span className="font-medium text-foreground">fiel</span>: sin límite de largo, se procesa por
                  bloques y se consolida en una sola conversación (resumen, tono, fechas y temas).
                </p>
                <input
                  ref={waInputRef}
                  type="file"
                  accept=".txt,.zip,text/plain,application/zip"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null
                    setWaFile(f)
                    setError(null)
                    setPreview(null)
                    setPhase('idle')
                  }}
                  disabled={working}
                  className="text-sm w-full file:mr-3 file:rounded file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-accent/10 disabled:opacity-50"
                />

                {waFile && (
                  <div className="rounded-md border border-border/60 bg-muted/10 px-2.5 py-1.5 text-[11px] flex items-center gap-2">
                    <MessagesSquare size={12} strokeWidth={1.75} className="text-muted-foreground/60 flex-shrink-0" aria-hidden="true" />
                    <span className="text-foreground truncate min-w-0 flex-1 font-mono">{waFile.name}</span>
                    <span className="text-muted-foreground/70 flex-shrink-0">{(waFile.size / 1024).toFixed(0)} KB</span>
                  </div>
                )}

                {/* Notas de voz: solo si el archivo es un .zip (los audios viven ahí). */}
                {waFile && /\.zip$/i.test(waFile.name) && (
                  <label className="flex items-start gap-2 text-[11px] text-muted-foreground cursor-pointer select-none">
                    <input type="checkbox" checked={transcribeAudios} disabled={working}
                      onChange={(e) => setTranscribeAudios(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-brand" />
                    <span>Transcribir notas de voz (las 25 más recientes) y leerlas como texto. Usa créditos de IA.</span>
                  </label>
                )}

                {/* Progreso de transcripción de audios. */}
                {working && audioProgress && (
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                    <span>{audioProgress.total > 0 ? `Transcribiendo nota de voz ${Math.min(audioProgress.done + 1, audioProgress.total)} de ${audioProgress.total}…` : 'Buscando notas de voz…'}</span>
                  </div>
                )}

                {/* Progreso bloque a bloque mientras se interpreta. */}
                {working && progress && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                      <span>Interpretando bloque {Math.min(progress.done + 1, progress.total)} de {progress.total}…</span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-brand transition-all"
                        style={{ width: `${progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                )}

                {error && <ApiErrorNotice error={error} className="p-2" />}

                <Button size="sm" onClick={runWhatsAppExport} disabled={!waFile || working} className="w-full">
                  {working ? (
                    <>
                      <Loader2 size={14} className="mr-2 animate-spin" />
                      Procesando conversación…
                    </>
                  ) : (
                    <>
                      <Upload size={14} strokeWidth={1.75} className="mr-2" aria-hidden="true" />
                      Procesar conversación
                    </>
                  )}
                </Button>
              </>
            ) : mode === 'text' ? (
              <>
                <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                  Pegá el texto de un <span className="font-medium text-foreground">perfil</span> (LinkedIn/Instagram) o una{' '}
                  <span className="font-medium text-foreground">nota</span> de lo que te enteraste — SIR detecta cuál es. Es la vía{' '}
                  <span className="font-medium text-foreground">confiable</span>: se lee exacto, sin
                  los errores de las capturas de página entera.
                </p>
                <textarea
                  value={pastedText}
                  onChange={(e) => onPastedTextChange(e.target.value)}
                  disabled={working}
                  rows={6}
                  placeholder="Pegá un perfil (nombre, headline, experiencia…) o una nota (“me contó que cumple el 20 de junio”)…"
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

/** Etiquetas de calidad/tono de interacción (1-5). */
const TONE_LABEL: Record<number, string> = {
  1: 'Tenso / conflictivo',
  2: 'Frío',
  3: 'Neutral',
  4: 'Cálido',
  5: 'Pleno',
}

/** Revisión dedicada del export de WhatsApp: resumen consolidado, tono, temas,
 *  hechos y un checklist de fechas para agregar a "Fechas importantes". */
function WhatsAppExportReview({
  personName,
  consolidated,
  messageCount,
  blocksUsed,
  selectedDateIdx,
  onToggleDate,
  disabled,
}: {
  personName: string
  consolidated: ConsolidatedExport
  messageCount: number
  blocksUsed: number
  selectedDateIdx: Set<number>
  onToggleDate: (i: number) => void
  disabled?: boolean
}) {
  const datesWithISO = consolidated.dates.filter((d) => d.dateISO)
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-2 text-[11px] text-muted-foreground flex items-start gap-2">
        <MessagesSquare size={13} strokeWidth={1.75} className="text-muted-foreground/60 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <span>
          Consolidé <span className="font-medium text-foreground">{messageCount}</span> mensajes en{' '}
          {blocksUsed} bloque{blocksUsed === 1 ? '' : 's'}. Revisá antes de asociar a {personName}.
        </span>
      </div>

      {/* Resumen consolidado */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.07em] text-text-tertiary mb-1">Resumen</div>
        <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">
          {consolidated.summary || '(sin resumen)'}
        </p>
      </div>

      {/* Tono + temas */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[10px] font-normal border-brand/30 bg-brand-soft text-brand-soft-foreground">
          Tono: {TONE_LABEL[consolidated.interactionQuality] ?? 'Neutral'} ({consolidated.interactionQuality}/5)
        </Badge>
        {consolidated.topics.slice(0, 10).map((t) => (
          <Badge key={t} variant="outline" className="text-[10px] font-normal">
            {t}
          </Badge>
        ))}
      </div>

      {/* Hechos notables */}
      {consolidated.facts.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-[0.07em] text-text-tertiary mb-1">Lo que aprendí</div>
          <ul className="space-y-0.5">
            {consolidated.facts.slice(0, 6).map((f, i) => (
              <li key={i} className="text-xs text-muted-foreground leading-relaxed flex gap-1.5">
                <span className="text-muted-foreground/40">·</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Fechas detectadas → checklist para Fechas importantes */}
      {consolidated.dates.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.07em] text-text-tertiary mb-1.5">
            <CalendarHeart size={11} strokeWidth={1.75} aria-hidden="true" />
            Fechas detectadas
            {datesWithISO.length > 0 && <span className="normal-case tracking-normal text-muted-foreground/60">(tildá las que quieras agregar)</span>}
          </div>
          <ul className="space-y-1">
            {consolidated.dates.map((d, i) => (
              <DateCheckRow
                key={i}
                date={d}
                checked={selectedDateIdx.has(i)}
                onToggle={() => onToggleDate(i)}
                disabled={disabled}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function DateCheckRow({
  date,
  checked,
  onToggle,
  disabled,
}: {
  date: ExtractedDate
  checked: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  const hasDate = Boolean(date.dateISO)
  return (
    <li className="flex items-start gap-2 rounded-md border border-border/40 px-2.5 py-1.5 text-xs">
      {hasDate ? (
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          aria-pressed={checked}
          aria-label={`Agregar ${date.label} a fechas importantes`}
          className={cn(
            'mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors disabled:opacity-50',
            checked ? 'border-brand bg-brand text-white' : 'border-border hover:border-brand/50',
          )}
        >
          {checked && <Check size={11} strokeWidth={3} aria-hidden="true" />}
        </button>
      ) : (
        <span className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-foreground">{date.label}</span>
          {date.recurring && (
            <Badge variant="outline" className="text-[9px] font-normal gap-1 px-1.5 py-0">
              <Repeat size={9} strokeWidth={2} aria-hidden="true" />
              anual
            </Badge>
          )}
          {hasDate ? (
            <span className="font-mono text-[10px] text-muted-foreground">{date.dateISO!.slice(0, 10)}</span>
          ) : (
            <span className="text-[10px] text-muted-foreground/60 italic">sin fecha exacta</span>
          )}
        </div>
        {date.rawText && <div className="text-[10px] text-muted-foreground/70 truncate">“{date.rawText}”</div>}
      </div>
    </li>
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
