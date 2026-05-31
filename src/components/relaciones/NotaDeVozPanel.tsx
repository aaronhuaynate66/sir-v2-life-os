'use client'
// SIR V2 — NotaDeVozPanel (#12 del detail page V1).
//
// Graba una nota de voz (MediaRecorder + getUserMedia), la sube al bucket
// privado person-voice-notes y la registra como observation voice_note
// (aparece tambien en la Bitacora #17). Lista las notas existentes con
// playback (signed URL) y borrado suave.
//
// Requiere HTTPS (prod ✓) + permiso de microfono. Si el navegador no
// soporta MediaRecorder, muestra un mensaje honesto en vez de romper.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mic, Square, Trash2, Play, Loader2, AlertCircle, Check } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useMounted } from '@/hooks/useMounted'
import {
  createVoiceNote, deleteVoiceNote, getVoiceNoteUrl, type VoiceNoteError,
} from './voice-notes/client'
import type { Observation } from '@/lib/capture/observations/types'

export interface NotaDeVozPanelProps {
  personId: string
  /** Observations curadas — filtramos voice_note acá. */
  observations: Observation[]
}

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']

function pickMime(): string | null {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') return null
  for (const m of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m
    } catch {
      /* ignore */
    }
  }
  return ''
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const ABS = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

type Phase = 'idle' | 'recording' | 'recorded' | 'uploading'

export function NotaDeVozPanel({ personId, observations }: NotaDeVozPanelProps) {
  const router = useRouter()
  // `supported` (window/MediaRecorder) y las fechas Intl de la lista difieren
  // server vs cliente -> render el cuerpo solo tras montar (mount-safe).
  const mounted = useMounted()
  const supported = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices

  const [phase, setPhase] = useState<Phase>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const blobRef = useRef<Blob | null>(null)
  const mimeRef = useRef<string>('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const voiceNotes = observations.filter((o) => o.captureType === 'voice_note')

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      cleanupStream()
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [cleanupStream, previewUrl])

  async function startRecording() {
    setError(null)
    const mime = pickMime()
    if (mime === null) {
      setError('Tu navegador no soporta grabación de audio.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      mimeRef.current = recorder.mimeType || mime || 'audio/webm'
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeRef.current })
        blobRef.current = blob
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        setPreviewUrl(URL.createObjectURL(blob))
        setPhase('recorded')
        cleanupStream()
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setElapsed(0)
      setPhase('recording')
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(`No se pudo acceder al micrófono: ${msg}`)
      cleanupStream()
      setPhase('idle')
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    // onstop hace el resto (cierra stream, setea preview).
  }

  function discard() {
    blobRef.current = null
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setElapsed(0)
    setPhase('idle')
    setError(null)
  }

  async function save() {
    if (!blobRef.current) return
    setPhase('uploading')
    setError(null)
    try {
      await createVoiceNote({
        personId,
        blob: blobRef.current,
        durationSec: elapsed,
        mime: mimeRef.current,
      })
      discard()
      router.refresh()
    } catch (e) {
      const err = e as VoiceNoteError
      setError(`Error ${err?.status ?? ''}: ${err?.message ?? 'No se pudo guardar'}${err?.detail ? ` — ${err.detail}` : ''}`)
      setPhase('recorded')
    }
  }

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Mic size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">Nota de voz</div>
        </div>

        {!mounted ? (
          <div className="h-9 w-28 rounded bg-muted/40 animate-pulse" aria-hidden="true" />
        ) : !supported ? (
          <p className="text-sm text-muted-foreground italic">
            Tu navegador no soporta grabación de audio. Probá desde Chrome o Safari actualizados.
          </p>
        ) : (
          <div className="space-y-3">
            {/* Controles de grabación */}
            <div className="flex items-center gap-3 flex-wrap">
              {phase === 'idle' && (
                <Button size="sm" onClick={startRecording}>
                  <Mic size={14} strokeWidth={1.75} className="mr-1.5" aria-hidden="true" />
                  Grabar
                </Button>
              )}
              {phase === 'recording' && (
                <>
                  <Button size="sm" variant="outline" onClick={stopRecording} className="border-red-500/40 text-red-400 hover:bg-red-500/10">
                    <Square size={13} strokeWidth={2} className="mr-1.5 fill-current" aria-hidden="true" />
                    Detener
                  </Button>
                  <span className="flex items-center gap-1.5 text-sm font-mono tabular-nums text-red-400">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
                    {fmtDuration(elapsed)}
                  </span>
                </>
              )}
              {(phase === 'recorded' || phase === 'uploading') && previewUrl && (
                <div className="w-full space-y-2">
                  <audio src={previewUrl} controls className="w-full h-9" />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={discard} disabled={phase === 'uploading'}>
                      Descartar
                    </Button>
                    <Button size="sm" onClick={save} disabled={phase === 'uploading'}>
                      {phase === 'uploading' ? (
                        <><Loader2 size={13} className="animate-spin mr-1.5" />Guardando…</>
                      ) : (
                        <><Check size={13} strokeWidth={2} className="mr-1.5" />Guardar ({fmtDuration(elapsed)})</>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/5 p-2 text-xs flex items-start gap-1.5 text-red-400">
                <AlertCircle size={12} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            {/* Lista de notas guardadas */}
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-2">
                Notas guardadas {voiceNotes.length > 0 && `(${voiceNotes.length})`}
              </div>
              {voiceNotes.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">Aún sin notas de voz.</p>
              ) : (
                <ul className="space-y-1.5">
                  {voiceNotes.map((vn) => (
                    <VoiceNoteRow key={vn.id} obs={vn} onDeleted={() => router.refresh()} />
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function VoiceNoteRow({ obs, onDeleted }: { obs: Observation; onDeleted: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const durationSec = typeof obs.data?.durationSec === 'number' ? obs.data.durationSec : null

  async function play() {
    if (url) return
    setLoading(true)
    setErr(null)
    const path = obs.sourceImagePath
    if (!path) {
      setErr('Sin archivo asociado.')
      setLoading(false)
      return
    }
    const signed = await getVoiceNoteUrl(path, obs.storageBucket ?? undefined)
    if (!signed) setErr('No se pudo cargar el audio.')
    setUrl(signed)
    setLoading(false)
  }

  async function onDelete() {
    setDeleting(true)
    try {
      await deleteVoiceNote(obs.id)
      onDeleted()
    } catch {
      setErr('No se pudo borrar.')
      setDeleting(false)
    }
  }

  return (
    <li className="rounded-md border border-border/50 bg-muted/10 px-2.5 py-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {!url ? (
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={play} disabled={loading} aria-label="Reproducir nota de voz">
              {loading ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Play size={13} strokeWidth={1.75} aria-hidden="true" />}
            </Button>
          ) : null}
          <span className="text-xs text-muted-foreground font-mono">
            {durationSec !== null ? fmtDuration(durationSec) : '—'} · {ABS.format(new Date(obs.observedAt))}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-muted-foreground/50 hover:text-red-400"
          onClick={onDelete}
          disabled={deleting}
          aria-label="Borrar nota de voz"
        >
          {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} strokeWidth={1.75} />}
        </Button>
      </div>
      {url && <audio src={url} controls autoPlay className="w-full h-9" />}
      {err && <p className="text-[11px] text-red-400">{err}</p>}
    </li>
  )
}
