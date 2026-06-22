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

import { useEffect, useState } from 'react'
import { Loader2, PhoneCall, UserPlus, X, Check } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { createPerson, searchPeople, type PersonCandidate } from '@/lib/capture/observations/client'
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
    } catch { setErr('No se pudo crear la persona. Reintentá.') } finally { setBusy(false) }
  }

  function reset() {
    setResolved(null); setName(''); setTranscript(''); setDate(todayLimaISO())
    setDone(null); setErr(null); setProgress(null); setCandidates([])
  }

  async function procesar() {
    if (!resolved || busy) return
    const text = transcript.trim()
    if (text.length < 20) { setErr('Pegá la transcripción de la llamada (al menos unas líneas).'); return }
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
      setErr('No se pudo procesar la llamada. Reintentá en un momento.')
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
          Grabá la llamada en tu iPhone (queda transcrita en Notas), copiá el texto y pegalo acá. SIR la convierte en una interacción: resumen, tono, temas y fechas — y la cruza con todo.
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
            <textarea
              value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={8}
              placeholder="Pegá acá la transcripción de la llamada…"
              className="w-full rounded-lg border border-border bg-background p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex items-center gap-3">
              <Button onClick={procesar} disabled={busy || transcript.trim().length < 20}>
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
