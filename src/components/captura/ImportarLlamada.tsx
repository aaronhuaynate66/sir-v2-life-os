'use client'
// SIR V2 — ImportarLlamada: pegar la TRANSCRIPCIÓN de una llamada (la que el
// iPhone deja en Notas al grabar) y convertirla en una interacción rica de SIR
// en un paso. Mismo "portón ¿de quién es?" que ImportarChat (matcher difuso →
// vincular o crear), y luego reusa la maquinaria de interpretación del export
// de WhatsApp: chunkText → interpretChunk (por bloque) → consolidate. Persiste
// como observación marcada source='call_transcript' (bitácora la rotula
// "Llamada"), crea un person_log de interacción (cuenta para score/recencia/
// día-X) y archiva el texto crudo en la bitácora. Sin formato WhatsApp: la
// transcripción es texto corrido.

import { useEffect, useRef, useState } from 'react'
import { Loader2, PhoneCall, UserPlus, X, Check, Upload, FileAudio, Type, Mic, Square } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { trackAiError } from '@/lib/analytics/track'
import { createPerson, searchPeople, type PersonCandidate } from '@/lib/capture/observations/client'
import { createClient } from '@/lib/supabase/client'
import { interpretChunk, persistWhatsAppExport, archiveConversation } from '@/lib/capture/whatsapp/export/client'
import { consolidateInterpretations } from '@/lib/capture/whatsapp/export/consolidate'
import { chunkText } from '@/lib/capture/call/chunkText'
import { createPersonLog } from '@/components/relaciones/person-logs/client'
import type { ChunkInterpretation } from '@/lib/capture/whatsapp/export/types'

function todayLimaISO(): string {
  // YYYY-MM-DD en America/Lima
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' })
  return fmt.format(new Date())
}

export function ImportarLlamada() {
  const [name, setName] = useState('')
  const [candidates, setCandidates] = useState<PersonCandidate[]>([])
  const [searching, setSearching] = useState(false)
  const [resolved, setResolved] = useState<{ id: string; name: string; created: boolean } | null>(null)

  const [transcript, setTranscript] = useState('')
  const [date, setDate] = useState(todayLimaISO())
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState<{ summary: string; quality: number } | null>(null)
  const [inputMode, setInputMode] = useState<'text' | 'audio' | 'record'>('text')
  const [transcribing, setTranscribing] = useState(false)

  // Grabador en vivo por sesión (Fase 3). Graba en cortes y transcribe sobre la
  // marcha; el texto se acumula en `transcript` y al parar se procesa como siempre.
  const [recording, setRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [chunkStatus, setChunkStatus] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordingRef = useRef(false)
  const CHUNK_MS = 5 * 60 * 1000 // corta y procesa cada 5 min

  // Sugerencias en vivo (debounce). Solo mientras no haya persona resuelta.
  useEffect(() => {
    if (resolved) return
    const q = name.trim()
    if (q.length < 2) { setCandidates([]); return }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const r = await searchPeople(q, { captureType: 'whatsapp_chat', signal: controller.signal })
        setCandidates(r.candidates)
      } catch {
        if (!controller.signal.aborted) setCandidates([])
      } finally {
        if (!controller.signal.aborted) setSearching(false)
      }
    }, 250)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [name, resolved])

  function vincular(c: PersonCandidate) { setErr(null); setResolved({ id: c.id, name: c.name, created: false }) }

  async function crearNueva() {
    const n = name.trim()
    if (!n || busy) return
    setBusy(true); setErr(null)
    try {
      const c = await createPerson({ name: n })
      setResolved({ id: c.person.id, name: c.person.name, created: true })
    } catch { setErr('No se pudo crear la persona. Reintenta.') } finally { setBusy(false) }
  }

  function reset() {
    if (recording) stopRecording()
    setResolved(null); setName(''); setTranscript(''); setDate(todayLimaISO())
    setDone(null); setErr(null); setProgress(null); setCandidates([]); setInputMode('text')
    setElapsed(0); setChunkStatus(null)
  }

  function extForMime(mime: string): string {
    if (mime.includes('webm')) return 'webm'
    if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a'
    if (mime.includes('ogg')) return 'ogg'
    if (mime.includes('wav')) return 'wav'
    if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3'
    return 'm4a'
  }

  async function subirYTranscribir(fileAudio: File) {
    if (!resolved || transcribing) return
    setErr(null); setTranscribing(true); setProgress('Subiendo audio…')
    try {
      const supabase = createClient()
      const { data: authData } = await supabase.auth.getUser()
      const userId = authData?.user?.id
      if (!userId) { setErr('Sesión expirada. Recarga la página.'); return }
      const mime = fileAudio.type || 'audio/mp4'
      const path = `${userId}/${resolved.id}/call-${crypto.randomUUID()}.${extForMime(mime)}`
      const { error: upErr } = await supabase.storage.from('person-voice-notes').upload(path, fileAudio, { contentType: mime, upsert: false })
      if (upErr) { setErr(`No se pudo subir el audio: ${upErr.message}`); return }
      setProgress('Transcribiendo… (puede tardar según el largo)')
      const res = await fetch('/api/capture/call/transcribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket: 'person-voice-notes', path }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setErr(b.detail || b.error || 'No se pudo transcribir el audio.')
        return
      }
      const { text } = (await res.json()) as { text: string }
      setTranscript(text)
      setInputMode('text') // pasa a revisión: ve el texto antes de procesar
      setProgress(null)
    } catch {
      trackAiError('call_import', { status: 0, message: 'No se pudo procesar el audio. Reintenta.' }) // GA4
      setErr('No se pudo procesar el audio. Reintenta.')
    } finally { setTranscribing(false); setProgress(null) }
  }

  function pickMime(): string {
    const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
    for (const m of cands) { try { if (MediaRecorder.isTypeSupported(m)) return m } catch { /* */ } }
    return ''
  }

  // Sube un corte de audio a Storage, lo transcribe y APPENDea el texto.
  async function transcribeChunkAppend(blob: Blob) {
    if (!resolved || blob.size < 2000) return
    setChunkStatus('Transcribiendo el último tramo…')
    try {
      const supabase = createClient()
      const { data: authData } = await supabase.auth.getUser()
      const userId = authData?.user?.id
      if (!userId) { setChunkStatus('Sesión expirada.'); return }
      const mime = blob.type || 'audio/webm'
      const path = `${userId}/${resolved.id}/live-${crypto.randomUUID()}.${extForMime(mime)}`
      const file = new File([blob], path.split('/').pop() as string, { type: mime })
      const { error: upErr } = await supabase.storage.from('person-voice-notes').upload(path, file, { contentType: mime, upsert: false })
      if (upErr) { setChunkStatus(`No se pudo subir el tramo: ${upErr.message}`); return }
      const res = await fetch('/api/capture/call/transcribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket: 'person-voice-notes', path }),
      })
      if (!res.ok) { setChunkStatus('No se pudo transcribir el tramo.'); return }
      const { text } = (await res.json()) as { text: string }
      if (text && text.trim()) setTranscript((prev) => (prev ? `${prev}\n${text.trim()}` : text.trim()))
      setChunkStatus(null)
    } catch {
      trackAiError('call_import', { status: 0, message: 'Error transcribiendo el tramo.' }) // GA4
      setChunkStatus('Error transcribiendo el tramo.')
    }
  }

  function startChunk() {
    const stream = streamRef.current
    if (!stream) return
    const mimeType = pickMime()
    const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
    const parts: Blob[] = []
    rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data) }
    rec.onstop = () => {
      const blob = new Blob(parts, { type: rec.mimeType || 'audio/webm' })
      void transcribeChunkAppend(blob)
      if (recordingRef.current && streamRef.current) startChunk() // siguiente tramo
    }
    recorderRef.current = rec
    rec.start()
    chunkTimerRef.current = setTimeout(() => { if (rec.state !== 'inactive') rec.stop() }, CHUNK_MS)
  }

  async function startRecording() {
    if (!resolved || recording) return
    setErr(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      recordingRef.current = true
      setRecording(true); setElapsed(0)
      elapsedTimerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000)
      startChunk()
    } catch {
      setErr('No pude acceder al micrófono. Dale permiso y reintenta.')
    }
  }

  function stopRecording() {
    recordingRef.current = false
    setRecording(false)
    if (chunkTimerRef.current) { clearTimeout(chunkTimerRef.current); chunkTimerRef.current = null }
    if (elapsedTimerRef.current) { clearInterval(elapsedTimerRef.current); elapsedTimerRef.current = null }
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') rec.stop() // dispara onstop → transcribe el último tramo
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null }
  }

  // Cleanup: si se desmonta mientras graba, cortar el micro.
  useEffect(() => () => {
    recordingRef.current = false
    if (chunkTimerRef.current) clearTimeout(chunkTimerRef.current)
    if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current)
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
  }, [])

  function fmtElapsed(s: number): string {
    const m = Math.floor(s / 60); const ss = s % 60
    return `${m}:${String(ss).padStart(2, '0')}`
  }

  async function procesar() {
    if (!resolved || busy) return
    const text = transcript.trim()
    if (text.length < 20) { setErr('Pega la transcripción de la llamada (al menos unas líneas).'); return }
    setBusy(true); setErr(null); setProgress(null)
    try {
      const chunks = chunkText(text)
      const parts: ChunkInterpretation[] = []
      for (let i = 0; i < chunks.length; i++) {
        setProgress(`Interpretando ${i + 1}/${chunks.length}…`)
        const part = await interpretChunk({ chunkText: chunks[i], personName: resolved.name, index: i, total: chunks.length })
        parts.push(part)
      }
      setProgress('Consolidando…')
      const consolidated = consolidateInterpretations(parts)
      const convISO = `${date}T12:00:00-05:00`
      const data: Record<string, unknown> = {
        personName: resolved.name,
        conversationDate: convISO,
        summary: consolidated.summary || `Llamada con ${resolved.name}.`,
        topics: consolidated.topics,
        emotionalStates: { user: consolidated.emotionalUser ?? undefined, otherPerson: consolidated.emotionalOther ?? undefined },
        confidence: consolidated.confidence,
        rawObservations: `Transcripción de llamada · ${date}`,
        source: 'call_transcript',
        messageCount: text.split(/\r?\n/).length,
        dateRange: { first: convISO, last: convISO },
        blockSummaries: consolidated.blockSummaries,
        facts: consolidated.facts,
        events: consolidated.events,
        extractedDates: consolidated.dates.map((d) => ({ label: d.label, dateISO: d.dateISO, rawText: d.rawText, recurring: d.recurring })),
        interactionQuality: consolidated.interactionQuality,
        recentTone: consolidated.recentTone,
        emotionalTone: consolidated.emotionalTone,
      }
      await persistWhatsAppExport({ personId: resolved.id, data, promoteDates: true })
      // Interacción (cuenta para score/recencia/día-X). El tono reciente refleja
      // mejor "cómo quedó" la llamada que el promedio.
      try {
        await createPersonLog({
          personId: resolved.id,
          kind: 'interaction',
          value: consolidated.recentTone || consolidated.interactionQuality,
          note: (consolidated.summary || '').slice(0, 240) || undefined,
        })
      } catch { /* best-effort */ }
      // Archivar el crudo en la bitácora (buscable).
      try {
        await archiveConversation({ personId: resolved.id, rawText: text, source: 'llamada', dateFirst: date, dateLast: date, messageCount: text.split(/\r?\n/).length })
      } catch { /* best-effort */ }
      setDone({ summary: data.summary as string, quality: consolidated.interactionQuality })
      setProgress(null)
    } catch {
      trackAiError('call_import', { status: 0, message: 'No se pudo procesar la llamada. Reintenta en un momento.' }) // GA4
      setErr('No se pudo procesar la llamada. Reintenta en un momento.')
      setProgress(null)
    } finally { setBusy(false) }
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-1">
          <PhoneCall size={18} className="text-muted-foreground" aria-hidden="true" />
          <h3 className="text-base font-semibold">Transcripción de llamada</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Graba una reunión o llamada <span className="text-foreground/80">en vivo</span> (SIR va transcribiendo por tramos), sube un audio, o pega una transcripción. SIR la convierte en una interacción: resumen, tono, temas y fechas — y la cruza con todo.
        </p>

        {done ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-good"><Check size={16} /> Llamada registrada con {resolved?.name}.</div>
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-foreground">{done.summary}</div>
            <div className="text-xs text-muted-foreground">Tono detectado: {done.quality}/5. Quedó en la bitácora y cuenta para el vínculo.</div>
            <Button variant="outline" size="sm" onClick={reset}>Registrar otra</Button>
          </div>
        ) : !resolved ? (
          <div className="space-y-3">
            <label className="text-xs font-medium text-muted-foreground">¿Con quién fue la llamada?</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la persona" autoComplete="off" />
            {searching && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={12} className="animate-spin" /> Buscando…</div>}
            {candidates.length > 0 && (
              <div className="space-y-1">
                {candidates.map((c) => (
                  <button key={c.id} type="button" onClick={() => vincular(c)}
                    className="w-full text-left rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/50 flex items-center justify-between">
                    <span>{c.name}</span><Badge variant="secondary" className="text-[10px]">vincular</Badge>
                  </button>
                ))}
              </div>
            )}
            {name.trim().length >= 2 && (
              <Button variant="outline" size="sm" onClick={crearNueva} disabled={busy}>
                {busy ? <Loader2 size={14} className="mr-2 animate-spin" /> : <UserPlus size={14} className="mr-2" />} Crear &ldquo;{name.trim()}&rdquo;
              </Button>
            )}
            {err && <div className="text-xs text-bad">{err}</div>}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary">{resolved.name}{resolved.created ? ' · nueva' : ''}</Badge>
              <button type="button" onClick={() => setResolved(null)} className="text-muted-foreground hover:text-foreground" aria-label="Cambiar persona"><X size={14} /></button>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Fecha de la llamada</label>
              <Input type="date" value={date} max={todayLimaISO()} onChange={(e) => setDate(e.target.value)} className="w-auto" />
            </div>

            {/* Toggle: pegar texto (iPhone nativo) vs subir audio (WhatsApp) */}
            <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
              <button type="button" onClick={() => setInputMode('text')}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 ${inputMode === 'text' ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'}`}>
                <Type size={13} /> Pegar texto
              </button>
              <button type="button" onClick={() => setInputMode('audio')}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 ${inputMode === 'audio' ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'}`}>
                <FileAudio size={13} /> Subir audio
              </button>
              <button type="button" onClick={() => setInputMode('record')}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 ${inputMode === 'record' ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground'}`}>
                <Mic size={13} /> Grabar en vivo
              </button>
            </div>

            {inputMode === 'audio' ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Para WhatsApp: pon la llamada en altavoz, graba con Notas de Voz y sube el archivo aquí. SIR lo transcribe (usa créditos de IA) y lo procesa igual.
                </p>
                <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground hover:bg-muted/40">
                  <Upload size={15} />
                  <span>Elegir archivo de audio (m4a, mp3, wav…)</span>
                  <input type="file" accept="audio/*" className="hidden" disabled={transcribing}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void subirYTranscribir(f); e.currentTarget.value = '' }} />
                </label>
                {transcribing && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={12} className="animate-spin" /> {progress ?? 'Procesando…'}</div>}
                {transcript.trim().length > 0 && !transcribing && (
                  <div className="text-xs text-good">Transcripción lista — revísala en “Pegar texto” y procésala.</div>
                )}
              </div>
            ) : inputMode === 'record' ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-warn/30 bg-warn-soft/40 p-2.5 text-[11px] text-muted-foreground leading-relaxed">
                  Grabas una reunión o llamada en la que <span className="text-foreground/80">tú participas</span>. Avísales a los demás si corresponde — SIR guarda el TEXTO, no el audio (cada tramo se borra al transcribirse).
                </div>
                <div className="flex items-center gap-3">
                  {!recording ? (
                    <Button onClick={startRecording} variant="outline" size="sm">
                      <Mic size={15} className="mr-2" /> Empezar a grabar
                    </Button>
                  ) : (
                    <Button onClick={stopRecording} size="sm" className="bg-bad hover:bg-bad/90 text-white">
                      <Square size={13} className="mr-2 fill-current" /> Parar y procesar
                    </Button>
                  )}
                  {recording && (
                    <span className="inline-flex items-center gap-2 text-sm text-bad font-mono tabular-nums">
                      <span className="h-2.5 w-2.5 rounded-full bg-bad animate-pulse" aria-hidden="true" />
                      {fmtElapsed(elapsed)}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground/70">
                  Procesa por tramos de ~5 min sobre la marcha. Mantén esta pestaña abierta y visible mientras grabas.
                </p>
                {chunkStatus && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 size={12} className="animate-spin" /> {chunkStatus}</div>}
                {transcript.trim().length > 0 && (
                  <div className="rounded-lg border border-border bg-muted/20 p-2.5 text-xs text-foreground/80 max-h-40 overflow-y-auto whitespace-pre-wrap">
                    {transcript}
                  </div>
                )}
              </div>
            ) : (
              <textarea
                value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={8}
                placeholder="Pega aquí la transcripción de la llamada…"
                className="w-full rounded-lg border border-border bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            )}

            <div className="flex items-center gap-3">
              <Button onClick={procesar} disabled={busy || recording || transcript.trim().length < 20}>
                {busy ? <Loader2 size={15} className="mr-2 animate-spin" /> : <PhoneCall size={15} className="mr-2" />} Procesar llamada
              </Button>
              {progress && <span className="text-xs text-muted-foreground">{progress}</span>}
            </div>
            {err && <div className="text-xs text-bad">{err}</div>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
