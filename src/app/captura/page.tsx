'use client'
// SIR V2 — /captura (Sesion 2 — pipeline completo end-to-end)
//
// Flujo:
//   1. Pick file -> comprimir + detectar tipo (POST /api/capture)
//   2. Si tipo tiene extractor: buscar persona sugerida en /api/people/search
//   3. Usuario elige: vincular existente, crear nueva, o skip
//   4. POST /api/capture/process -> extractor Vision + Storage upload + insert observation
//   5. Mostrar Observation row + datos extraidos
//
// NO crea aun el detail page. Esta vista es la cama de pruebas para validar
// que B.2 / B.3 / B.4 + persistencia + matcher andan correctos.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Camera, Loader2, CheckCircle2, UserPlus, Users, X } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { detectCaptureType, DetectorError } from '@/lib/capture/detector/client'
import type { DetectResult } from '@/lib/capture/detector/client'
import {
  HttpError,
  createPerson,
  processCapture,
  searchPeople,
  type PersonCandidate,
  type ProcessCaptureResponse,
} from '@/lib/capture/observations/client'
import type { CaptureType, Observation } from '@/lib/capture/observations/types'

const TYPES_WITH_EXTRACTOR: ReadonlySet<CaptureType> = new Set([
  'whatsapp_chat',
  'whatsapp_info',
  'instagram',
  'linkedin',
])

export default function CapturaIndexPage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={1} />
  return <CapturaIndexContent />
}

interface ErrorState {
  status: number
  message: string
  detail?: string
}

function CapturaIndexContent() {
  // ── Step 1: file picking + detector ───────────────────────────────
  const [file, setFile] = useState<File | null>(null)
  const [detection, setDetection] = useState<DetectResult | null>(null)
  const [detectLoading, setDetectLoading] = useState(false)
  const [detectError, setDetectError] = useState<ErrorState | null>(null)

  // ── Step 2: person matcher ────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [candidates, setCandidates] = useState<PersonCandidate[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<ErrorState | null>(null)
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  const [selectedPersonName, setSelectedPersonName] = useState<string | null>(null)

  // Inline create-new-person form
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createLoading, setCreateLoading] = useState(false)

  // ── Step 3: process (extract + storage + insert) ─────────────────
  const [processLoading, setProcessLoading] = useState(false)
  const [processError, setProcessError] = useState<ErrorState | null>(null)
  const [processed, setProcessed] = useState<ProcessCaptureResponse | null>(null)

  // ─── handlers ─────────────────────────────────────────────────────

  const resetForNewFile = useCallback(() => {
    setDetection(null)
    setDetectError(null)
    setCandidates([])
    setSearchError(null)
    setSelectedPersonId(null)
    setSelectedPersonName(null)
    setShowCreate(false)
    setCreateName('')
    setProcessError(null)
    setProcessed(null)
    setSearchQuery('')
  }, [])

  const onFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0] ?? null
      setFile(f)
      resetForNewFile()
    },
    [resetForNewFile],
  )

  const onDetect = useCallback(async () => {
    if (!file) return
    setDetectLoading(true)
    setDetectError(null)
    setDetection(null)
    setProcessed(null)
    try {
      const r = await detectCaptureType(file)
      setDetection(r)
      // Auto-poblar el query del matcher con suggestedPersonName.
      if (r.detected.suggestedPersonName) {
        setSearchQuery(r.detected.suggestedPersonName)
        setCreateName(r.detected.suggestedPersonName)
      }
    } catch (e) {
      if (e instanceof DetectorError) {
        setDetectError({ status: e.status, message: e.message, detail: e.detail })
      } else {
        const msg = e instanceof Error ? e.message : String(e)
        setDetectError({ status: 0, message: msg })
      }
    } finally {
      setDetectLoading(false)
    }
  }, [file])

  // Debounced search trigger when query / capture type cambian.
  useEffect(() => {
    if (!detection) return
    const q = searchQuery.trim()
    if (q.length < 2) {
      setCandidates([])
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setSearchLoading(true)
      setSearchError(null)
      try {
        const r = await searchPeople(q, {
          captureType: detection.detected.type,
          signal: controller.signal,
        })
        setCandidates(r.candidates)
      } catch (e) {
        if (controller.signal.aborted) return
        if (e instanceof HttpError) {
          setSearchError({ status: e.status, message: e.message, detail: e.detail })
        } else {
          const msg = e instanceof Error ? e.message : String(e)
          setSearchError({ status: 0, message: msg })
        }
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false)
      }
    }, 250)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [searchQuery, detection])

  const onSelectPerson = useCallback((p: PersonCandidate) => {
    setSelectedPersonId(p.id)
    setSelectedPersonName(p.name)
    setShowCreate(false)
  }, [])

  const onClearSelection = useCallback(() => {
    setSelectedPersonId(null)
    setSelectedPersonName(null)
  }, [])

  const onCreatePerson = useCallback(async () => {
    const trimmed = createName.trim()
    if (!trimmed || !detection) return
    setCreateLoading(true)
    try {
      const captureType = detection.detected.type
      const extras: {
        instagram_handle?: string
        linkedin_url?: string
        phone_number?: string
      } = {}
      // Si el detector sugiere algo util (todavia no extraemos hasta el process,
      // por lo cual estos campos quedan vacios al momento de crear). En una
      // iteracion futura podriamos llamar al extractor primero y pre-fill.
      const r = await createPerson({ name: trimmed, ...extras })
      const p = r.person
      const candidate: PersonCandidate = {
        id: p.id,
        name: p.name,
        slug: p.slug,
        alias: p.alias,
        relationship: p.relationship,
        category: p.category,
        importance_score: p.importance_score,
        instagram_handle: p.instagram_handle,
        linkedin_url: p.linkedin_url,
        phone_number: p.phone_number,
        matchScore: 100,
        matchReason: 'just_created',
      }
      setCandidates((curr) => [candidate, ...curr])
      setSelectedPersonId(p.id)
      setSelectedPersonName(p.name)
      setShowCreate(false)
      void captureType
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setSearchError({
        status: e instanceof HttpError ? e.status : 0,
        message: 'No se pudo crear la persona',
        detail: msg,
      })
    } finally {
      setCreateLoading(false)
    }
  }, [createName, detection])

  const onProcess = useCallback(async () => {
    if (!detection) return
    setProcessLoading(true)
    setProcessError(null)
    setProcessed(null)
    try {
      const r = await processCapture({
        file: detection.compressedBlob,
        captureType: detection.detected.type,
        detectorData: detection.detected,
        personId: selectedPersonId,
      })
      setProcessed(r)
    } catch (e) {
      if (e instanceof HttpError) {
        setProcessError({ status: e.status, message: e.message, detail: e.detail })
      } else {
        const msg = e instanceof Error ? e.message : String(e)
        setProcessError({ status: 0, message: msg })
      }
    } finally {
      setProcessLoading(false)
    }
  }, [detection, selectedPersonId])

  const canExtract =
    detection !== null && TYPES_WITH_EXTRACTOR.has(detection.detected.type)

  return (
    <AppShell>
      <Link
        href="/yo"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft size={13} strokeWidth={1.75} aria-hidden="true" />
        Volver a Self
      </Link>

      <header className="mb-6 sm:mb-8">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-sans mb-1">
          SIR V2 &mdash; Captura universal (Sesión 2 / pipeline completo)
        </div>
        <div className="flex items-center gap-3">
          <Camera size={20} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Captura end-to-end
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">
          Detector → Extractor especifico → Storage → tabla observations.
          Soporta whatsapp_chat, whatsapp_info, instagram, linkedin.
        </p>
      </header>

      <Card className="shadow-none mb-6">
        <CardContent className="p-4 sm:p-6 space-y-4">
          {/* STEP 1: PICK FILE */}
          <div>
            <label className="text-xs uppercase tracking-widest text-muted-foreground/70 font-sans block mb-2">
              1. Imagen
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={onFile}
              disabled={detectLoading || processLoading}
              className="text-sm w-full file:mr-3 file:rounded file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-accent/10"
            />
            {file && (
              <div className="mt-2 text-xs text-muted-foreground font-mono">
                {file.name} · {(file.size / 1024).toFixed(0)} KB · {file.type}
              </div>
            )}
          </div>

          {/* STEP 2: DETECTOR */}
          <div>
            <Button
              onClick={onDetect}
              disabled={!file || detectLoading || processLoading}
              size="sm"
            >
              {detectLoading ? (
                <>
                  <Loader2 size={14} className="mr-2 animate-spin" />
                  Detectando…
                </>
              ) : (
                'Detectar tipo'
              )}
            </Button>
          </div>

          {detectError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs space-y-1">
              <div className="font-medium text-red-400">
                Error HTTP {detectError.status}: {detectError.message}
              </div>
              {detectError.detail && (
                <div className="text-muted-foreground">{detectError.detail}</div>
              )}
            </div>
          )}

          {detection && (
            <div className="rounded-md border border-border bg-muted/20 p-4 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-wider">
                  Detectado
                </Badge>
                <span className="text-sm font-medium font-mono">{detection.detected.type}</span>
                <Badge variant="secondary" className="text-[10px] font-mono">
                  conf. {detection.detected.confidence}
                </Badge>
                <span className="text-[10px] font-mono text-muted-foreground/70">
                  {(detection.originalBytes / 1024).toFixed(0)} KB →{' '}
                  {(detection.compressedBytes / 1024).toFixed(0)} KB
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Razonamiento:</span>{' '}
                {detection.detected.reasoning}
              </div>
              {detection.detected.suggestedPersonName && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Sugerencia persona:</span>{' '}
                  {detection.detected.suggestedPersonName}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* STEP 3: PERSON MATCHER (solo si hay extractor disponible) */}
      {canExtract && (
        <Card className="shadow-none mb-6">
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Users size={16} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
              <h2 className="text-sm font-semibold tracking-tight">
                2. Vincular persona
              </h2>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
                opcional
              </span>
            </div>

            {selectedPersonId ? (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-400" />
                  <span className="text-foreground font-medium">{selectedPersonName}</span>
                  <span className="font-mono text-muted-foreground/70">{selectedPersonId}</span>
                </div>
                <button
                  type="button"
                  onClick={onClearSelection}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Limpiar seleccion"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground/70 font-sans block mb-2">
                    Buscar
                  </label>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Nombre, alias, @handle, telefono…"
                    className="text-sm w-full rounded border border-border bg-background px-3 py-1.5"
                    disabled={processLoading}
                  />
                </div>

                {searchLoading && (
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin" />
                    Buscando…
                  </div>
                )}

                {searchError && (
                  <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs">
                    <div className="font-medium text-red-400">
                      Error HTTP {searchError.status}: {searchError.message}
                    </div>
                    {searchError.detail && (
                      <div className="text-muted-foreground">{searchError.detail}</div>
                    )}
                  </div>
                )}

                {candidates.length > 0 && (
                  <ul className="space-y-1.5 max-h-72 overflow-y-auto">
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
                              {c.instagram_handle && ` · @${c.instagram_handle}`}
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

                {searchQuery.trim().length >= 2 &&
                  !searchLoading &&
                  candidates.length === 0 &&
                  !searchError && (
                    <div className="text-xs text-muted-foreground italic">
                      Sin coincidencias en tus personas.
                    </div>
                  )}

                {/* Create new person */}
                <div className="pt-2">
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
                        <Button
                          size="sm"
                          onClick={onCreatePerson}
                          disabled={createLoading || createName.trim().length === 0}
                        >
                          {createLoading ? (
                            <>
                              <Loader2 size={12} className="mr-2 animate-spin" />
                              Creando…
                            </>
                          ) : (
                            'Crear y vincular'
                          )}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowCreate(true)}
                      disabled={processLoading}
                    >
                      <UserPlus size={14} className="mr-2" />
                      Crear persona nueva
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* STEP 4: PROCESS (extract + storage + insert) */}
      {canExtract && (
        <Card className="shadow-none mb-6">
          <CardContent className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold tracking-tight">
                3. Guardar observation
              </h2>
              <Button
                size="sm"
                onClick={onProcess}
                disabled={!detection || processLoading || processed !== null}
              >
                {processLoading ? (
                  <>
                    <Loader2 size={14} className="mr-2 animate-spin" />
                    Procesando…
                  </>
                ) : processed ? (
                  'Guardado ✓'
                ) : selectedPersonId ? (
                  'Extraer y guardar con persona'
                ) : (
                  'Extraer y guardar sin persona'
                )}
              </Button>
            </div>

            {processError && (
              <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs space-y-1">
                <div className="font-medium text-red-400">
                  Error HTTP {processError.status}: {processError.message}
                </div>
                {processError.detail && (
                  <div className="text-muted-foreground">{processError.detail}</div>
                )}
              </div>
            )}

            {processed && <ProcessedView result={processed} />}
          </CardContent>
        </Card>
      )}

      {!canExtract && detection && (
        <Card className="shadow-none mb-6">
          <CardContent className="p-4 sm:p-6">
            <p className="text-xs text-muted-foreground">
              El tipo <span className="font-mono">{detection.detected.type}</span> no
              tiene extractor todavia. Persistencia de tipos sin extractor (manual_note,
              voice_note, unknown) viene en sesiones futuras.
            </p>
          </CardContent>
        </Card>
      )}
    </AppShell>
  )
}

function ProcessedView({ result }: { result: ProcessCaptureResponse }) {
  const obs: Observation = result.observation
  return (
    <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge className="text-[10px] font-mono uppercase tracking-wider">Guardado</Badge>
        <span className="text-xs font-mono text-foreground">{obs.id}</span>
        <Badge variant="outline" className="text-[10px] font-mono">
          {obs.captureType}
        </Badge>
        {obs.confidence && (
          <Badge variant="secondary" className="text-[10px] font-mono">
            conf. {obs.confidence}
          </Badge>
        )}
        {obs.needsReview && (
          <Badge variant="destructive" className="text-[10px] font-mono">
            needs review
          </Badge>
        )}
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <div>
          <span className="font-medium text-foreground">person_id:</span>{' '}
          <span className="font-mono">{obs.personId ?? '(null)'}</span>
        </div>
        <div>
          <span className="font-medium text-foreground">storage:</span>{' '}
          <span className="font-mono">
            {obs.storageBucket}/{obs.sourceImagePath}
          </span>
        </div>
        <div>
          <span className="font-medium text-foreground">observed_at:</span>{' '}
          <span className="font-mono">{obs.observedAt}</span>
        </div>
        <div>
          <span className="font-medium text-foreground">captured_at:</span>{' '}
          <span className="font-mono">{obs.capturedAt}</span>
        </div>
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground/70 hover:text-foreground">
          Datos extraidos ({Object.keys(result.extracted).length} campos)
        </summary>
        <pre className="mt-2 p-2 bg-background rounded text-[10px] overflow-x-auto font-mono whitespace-pre-wrap break-all">
          {JSON.stringify(result.extracted, null, 2)}
        </pre>
      </details>

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground/70 hover:text-foreground">
          Raw output Vision
        </summary>
        <pre className="mt-2 p-2 bg-background rounded text-[10px] overflow-x-auto font-mono whitespace-pre-wrap break-all">
          {result.raw}
        </pre>
      </details>
    </div>
  )
}
