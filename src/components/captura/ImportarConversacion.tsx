'use client'
// SIR V2 — ImportarConversacion: subí UN export de WhatsApp (.zip/.txt) y, a
// partir de él, CREÁ una persona nueva o ADJUNTÁ el contenido a una existente.
// Opcional: en el mismo paso podés subir su captura de LinkedIn para enriquecer
// el perfil de una sola vez.
//
// A diferencia de AgregarCapturaPanel (que corre DENTRO de una persona fija),
// acá la persona se resuelve recién al final. Reusa TODO el pipeline puro del
// export (parse → chunk → interpret → consolidate → persist) y el matcher de
// /captura (searchPeople / createPerson / processCapture). No toca el panel
// existente.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  MessagesSquare,
  Upload,
  Loader2,
  UserPlus,
  Users,
  CheckCircle2,
  X,
  ArrowRight,
  Linkedin,
} from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'

import {
  readExportText,
  interpretChunk,
  persistWhatsAppExport,
} from '@/lib/capture/whatsapp/export/client'
import { parseWhatsAppExport, isWhatsAppExport } from '@/lib/capture/whatsapp/export/parse'
import { chunkConversation } from '@/lib/capture/whatsapp/export/chunk'
import {
  consolidateInterpretations,
  buildExportObservationData,
} from '@/lib/capture/whatsapp/export/consolidate'
import type { ChunkInterpretation, ParsedExport } from '@/lib/capture/whatsapp/export/types'
import { inferContactName } from '@/lib/capture/whatsapp/export/contactName'

import {
  HttpError,
  createPerson,
  searchPeople,
  processCapture,
  type PersonCandidate,
} from '@/lib/capture/observations/client'
import { detectCaptureType, DetectorError } from '@/lib/capture/detector/client'

type Phase = 'idle' | 'analyzing' | 'ready' | 'importing' | 'done'

interface ErrorState {
  status: number
  message: string
  detail?: string
}

interface ImportResult {
  personId: string
  personName: string
  slug: string | null
  messageCount: number
  /** Resultado del adjunto de LinkedIn: null si no se subió. */
  linkedin: 'ok' | 'skipped' | { warn: string } | null
}

/** Procesa items con concurrencia acotada (clona el patrón de AgregarCapturaPanel). */
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

function rangeLabel(parsed: ParsedExport): string {
  if (parsed.firstISO && parsed.lastISO) {
    return `${parsed.firstISO.slice(0, 10)} → ${parsed.lastISO.slice(0, 10)}`
  }
  return 'rango s/d'
}

export function ImportarConversacion() {
  const waInputRef = useRef<HTMLInputElement>(null)
  const liInputRef = useRef<HTMLInputElement>(null)

  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<ErrorState | null>(null)

  // Archivos.
  const [waFile, setWaFile] = useState<File | null>(null)
  const [liFile, setLiFile] = useState<File | null>(null)

  // Conversación parseada + nombre del contacto inferido.
  const [parsed, setParsed] = useState<ParsedExport | null>(null)
  const [contactName, setContactName] = useState<string>('')

  // Resolución de persona (matcher, igual que /captura).
  const [searchQuery, setSearchQuery] = useState('')
  const [candidates, setCandidates] = useState<PersonCandidate[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  const [selectedPersonName, setSelectedPersonName] = useState<string | null>(null)
  const [selectedPersonSlug, setSelectedPersonSlug] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createLoading, setCreateLoading] = useState(false)

  // Progreso de import + resultado.
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  const resetAll = useCallback(() => {
    setPhase('idle')
    setError(null)
    setWaFile(null)
    setLiFile(null)
    setParsed(null)
    setContactName('')
    setSearchQuery('')
    setCandidates([])
    setSearchLoading(false)
    setSelectedPersonId(null)
    setSelectedPersonName(null)
    setSelectedPersonSlug(null)
    setShowCreate(false)
    setCreateName('')
    setCreateLoading(false)
    setProgress(null)
    setResult(null)
    if (waInputRef.current) waInputRef.current.value = ''
    if (liInputRef.current) liInputRef.current.value = ''
  }, [])

  // ── Paso 1: analizar el export ───────────────────────────────────
  const onAnalyze = useCallback(async () => {
    if (!waFile) return
    setPhase('analyzing')
    setError(null)
    try {
      const text = await readExportText(waFile)
      if (!isWhatsAppExport(text)) {
        setError({
          status: 0,
          message: 'No parece un export de WhatsApp',
          detail: 'Subí el .zip o el _chat.txt que genera "Exportar chat" en WhatsApp.',
        })
        setPhase('idle')
        return
      }
      const p = parseWhatsAppExport(text)
      if (p.messages.length === 0) {
        setError({
          status: 0,
          message: 'La conversación no tiene mensajes legibles',
          detail: 'El archivo se leyó pero no se pudo extraer ningún mensaje.',
        })
        setPhase('idle')
        return
      }
      const name = inferContactName({ fileName: waFile.name, participants: p.participants })
      setParsed(p)
      setContactName(name)
      setSearchQuery(name)
      setCreateName(name)
      setPhase('ready')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError({ status: e instanceof HttpError ? e.status : 0, message: 'No se pudo leer el archivo', detail: msg })
      setPhase('idle')
    }
  }, [waFile])

  // ── Matcher: búsqueda con debounce (idéntico a /captura) ─────────
  useEffect(() => {
    if (phase !== 'ready') return
    const q = searchQuery.trim()
    if (q.length < 2) {
      setCandidates([])
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const r = await searchPeople(q, { captureType: 'whatsapp_chat', signal: controller.signal })
        setCandidates(r.candidates)
      } catch {
        if (!controller.signal.aborted) setCandidates([])
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false)
      }
    }, 250)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [searchQuery, phase])

  const onSelectPerson = useCallback((p: PersonCandidate) => {
    setSelectedPersonId(p.id)
    setSelectedPersonName(p.name)
    setSelectedPersonSlug(p.slug)
    setShowCreate(false)
  }, [])

  const onClearSelection = useCallback(() => {
    setSelectedPersonId(null)
    setSelectedPersonName(null)
    setSelectedPersonSlug(null)
  }, [])

  const onCreatePerson = useCallback(async () => {
    const trimmed = createName.trim()
    if (!trimmed) return
    setCreateLoading(true)
    setError(null)
    try {
      const r = await createPerson({ name: trimmed })
      setSelectedPersonId(r.person.id)
      setSelectedPersonName(r.person.name)
      setSelectedPersonSlug(r.person.slug)
      setShowCreate(false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError({ status: e instanceof HttpError ? e.status : 0, message: 'No se pudo crear la persona', detail: msg })
    } finally {
      setCreateLoading(false)
    }
  }, [createName])

  // ── Paso 2: importar (persiste WhatsApp + adjunta LinkedIn) ──────
  const onImport = useCallback(async () => {
    if (!parsed || !selectedPersonId || !selectedPersonName) return
    setPhase('importing')
    setError(null)
    setProgress(null)
    try {
      // 1) Interpretar bloque a bloque (pool acotado) → consolidar → persistir.
      const chunks = chunkConversation(parsed.messages)
      const interpretations: ChunkInterpretation[] = new Array(chunks.length)
      setProgress({ done: 0, total: chunks.length })
      let done = 0
      await runPool(chunks, 4, async (chunk, i) => {
        const interp = await interpretChunk({
          chunkText: chunk.text,
          personName: selectedPersonName,
          index: i,
          total: chunks.length,
        })
        interpretations[i] = interp
        done += 1
        setProgress({ done, total: chunks.length })
      })

      const consolidated = consolidateInterpretations(interpretations.filter(Boolean))
      const data = buildExportObservationData(parsed, consolidated, selectedPersonName)
      await persistWhatsAppExport({ personId: selectedPersonId, data })

      // 2) Opcional: adjuntar la captura de LinkedIn a la MISMA persona.
      let linkedin: ImportResult['linkedin'] = liFile ? 'ok' : null
      if (liFile) {
        try {
          const det = await detectCaptureType(liFile)
          await processCapture({
            file: liFile,
            captureType: det.detected.type,
            detectorData: det.detected,
            personId: selectedPersonId,
          })
          if (det.detected.type !== 'linkedin') {
            linkedin = { warn: `La imagen se detectó como "${det.detected.type}", no LinkedIn — se adjuntó igual.` }
          }
        } catch (e) {
          const msg = e instanceof DetectorError || e instanceof HttpError ? e.message : String(e)
          linkedin = { warn: `La conversación se importó, pero la captura de LinkedIn falló: ${msg}` }
        }
      }

      setResult({
        personId: selectedPersonId,
        personName: selectedPersonName,
        slug: selectedPersonSlug,
        messageCount: parsed.messages.length,
        linkedin,
      })
      setPhase('done')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError({ status: e instanceof HttpError ? e.status : 0, message: 'No se pudo importar la conversación', detail: msg })
      setPhase('ready')
    }
  }, [parsed, selectedPersonId, selectedPersonName, selectedPersonSlug, liFile])

  // ─────────────────────────────── UI ───────────────────────────────
  if (phase === 'done' && result) {
    return (
      <Card className="shadow-none mb-6 border-ok/30">
        <CardContent className="p-4 sm:p-6 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-ok" />
            <h2 className="text-sm font-semibold tracking-tight">Conversación importada</h2>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Se importaron <span className="text-foreground font-medium">{result.messageCount}</span>{' '}
            mensajes a{' '}
            <span className="text-foreground font-medium">{result.personName}</span>.
            {result.linkedin === 'ok' && ' La captura de LinkedIn quedó adjunta al perfil.'}
          </p>
          {result.linkedin && typeof result.linkedin === 'object' && (
            <div className="text-[11px] text-warn-foreground bg-warn-soft border border-warn/30 rounded-md p-2">
              {result.linkedin.warn}
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {result.slug && (
              <Button size="sm" asChild>
                <Link href={`/relaciones/${result.slug}`} className="inline-flex items-center gap-1.5">
                  Ver el perfil <ArrowRight size={14} />
                </Link>
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={resetAll}>
              Importar otra conversación
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground/80 leading-relaxed pt-1">
            Tip: para que el briefing no salga tibio, entrá al perfil y ajustá Importancia + Impacto,
            y corré “Actualizar memorias”.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="shadow-none mb-6">
      <CardContent className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <MessagesSquare size={16} strokeWidth={1.75} className="text-muted-foreground/70" />
          <h2 className="text-sm font-semibold tracking-tight">Importar una conversación de WhatsApp</h2>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
          Subí el export de un chat (.zip o .txt). SIR lo lee y te deja{' '}
          <span className="text-foreground">crear una persona nueva</span> con esa conversación o{' '}
          <span className="text-foreground">adjuntarla a alguien que ya tenés</span>. Si querés,
          sumá su captura de LinkedIn en el mismo paso.
        </p>

        {/* Paso 1: archivo + analizar */}
        <div className="space-y-2">
          <label className="text-xs uppercase tracking-[0.07em] text-text-tertiary font-sans block">
            1. Export de WhatsApp
          </label>
          <input
            ref={waInputRef}
            type="file"
            accept=".zip,.txt,text/plain,application/zip"
            disabled={phase === 'analyzing' || phase === 'importing'}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              setWaFile(f)
              setParsed(null)
              setPhase('idle')
              setError(null)
              setSelectedPersonId(null)
              setSelectedPersonName(null)
              setSelectedPersonSlug(null)
            }}
            className="text-sm w-full file:mr-3 file:rounded file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-accent/10"
          />
          {waFile && (
            <div className="text-[11px] text-muted-foreground font-mono">
              {waFile.name} · {(waFile.size / 1024).toFixed(0)} KB
            </div>
          )}
          {phase !== 'ready' && phase !== 'importing' && (
            <Button size="sm" onClick={onAnalyze} disabled={!waFile || phase === 'analyzing'}>
              {phase === 'analyzing' ? (
                <>
                  <Loader2 size={14} className="mr-2 animate-spin" /> Analizando…
                </>
              ) : (
                'Analizar conversación'
              )}
            </Button>
          )}
        </div>

        {error && <ApiErrorNotice error={error} />}

        {/* Meta del parse */}
        {parsed && (phase === 'ready' || phase === 'importing') && (
          <div className="rounded-md border border-border bg-muted/20 p-3 text-xs space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-[10px] font-mono">
                {parsed.messages.length} mensajes
              </Badge>
              <Badge variant="outline" className="text-[10px] font-mono">
                {rangeLabel(parsed)}
              </Badge>
              {parsed.mediaCount > 0 && (
                <Badge variant="outline" className="text-[10px] font-mono">
                  {parsed.mediaCount} media
                </Badge>
              )}
            </div>
            <div className="text-muted-foreground">
              <span className="font-medium text-foreground">Participantes:</span>{' '}
              {parsed.participants.join(', ') || 's/d'}
            </div>
          </div>
        )}

        {/* Paso 2: resolver persona */}
        {phase === 'ready' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Users size={15} className="text-muted-foreground/70" />
              <h3 className="text-sm font-semibold tracking-tight">2. ¿De quién es esta conversación?</h3>
            </div>

            {selectedPersonId ? (
              <div className="rounded-md border border-ok/30 bg-ok-soft p-3 text-xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-ok" />
                  <span className="text-foreground font-medium">{selectedPersonName}</span>
                </div>
                <button
                  type="button"
                  onClick={onClearSelection}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Limpiar selección"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar a alguien que ya tenés…"
                  className="text-sm w-full rounded border border-border bg-background px-3 py-1.5"
                />
                {searchLoading && (
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin" /> Buscando…
                  </div>
                )}
                {candidates.length > 0 && (
                  <ul className="space-y-1.5 max-h-60 overflow-y-auto">
                    {candidates.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => onSelectPerson(c)}
                          className="w-full text-left rounded border border-border hover:border-accent/50 px-3 py-2 text-xs flex items-center justify-between gap-3"
                        >
                          <div>
                            <div className="font-medium text-foreground">{c.name}</div>
                            <div className="text-muted-foreground font-mono text-[10px]">
                              {c.slug ?? c.id}
                              {c.alias && ` · alias: ${c.alias}`}
                            </div>
                          </div>
                          <Badge variant="secondary" className="text-[10px] font-mono shrink-0">
                            {c.matchReason} {c.matchScore}
                          </Badge>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {searchQuery.trim().length >= 2 && !searchLoading && candidates.length === 0 && (
                  <div className="text-xs text-muted-foreground italic">Sin coincidencias en tus personas.</div>
                )}

                <div className="pt-1">
                  {showCreate ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={createName}
                        onChange={(e) => setCreateName(e.target.value)}
                        placeholder="Nombre de la persona nueva"
                        className="text-sm w-full rounded border border-border bg-background px-3 py-1.5"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={onCreatePerson} disabled={createLoading || createName.trim().length === 0}>
                          {createLoading ? (
                            <>
                              <Loader2 size={12} className="mr-2 animate-spin" /> Creando…
                            </>
                          ) : (
                            'Crear y usar'
                          )}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
                      <UserPlus size={14} className="mr-2" />
                      Crear persona nueva{contactName ? ` · ${contactName}` : ''}
                    </Button>
                  )}
                </div>
              </>
            )}

            {/* Paso 3 (opcional): LinkedIn */}
            <div className="pt-2 border-t border-border/50 space-y-2">
              <label className="text-xs uppercase tracking-[0.07em] text-text-tertiary font-sans flex items-center gap-1.5">
                <Linkedin size={13} /> 3. Captura de LinkedIn (opcional)
              </label>
              <input
                ref={liInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setLiFile(e.target.files?.[0] ?? null)}
                className="text-sm w-full file:mr-3 file:rounded file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-accent/10"
              />
              {liFile && (
                <div className="text-[11px] text-muted-foreground font-mono">
                  {liFile.name} · {(liFile.size / 1024).toFixed(0)} KB
                </div>
              )}
            </div>

            {/* Importar */}
            <div className="pt-2">
              <Button onClick={onImport} disabled={!selectedPersonId}>
                <Upload size={15} className="mr-2" />
                Importar{liFile ? ' (chat + LinkedIn)' : ''}
              </Button>
              {!selectedPersonId && (
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Elegí o creá la persona para habilitar el import.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Progreso del import */}
        {phase === 'importing' && (
          <div className="rounded-md border border-border bg-muted/20 p-3 text-xs space-y-2">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />
              {progress
                ? `Interpretando la conversación… bloque ${progress.done} de ${progress.total}`
                : 'Preparando…'}
            </div>
            {progress && progress.total > 0 && (
              <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
