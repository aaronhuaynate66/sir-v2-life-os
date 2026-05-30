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
  linkObservationToPerson,
  processCapture,
  searchPeople,
  type PersonCandidate,
  type ProcessCaptureResponse,
} from '@/lib/capture/observations/client'
import type { CaptureType, Observation } from '@/lib/capture/observations/types'

const TYPES_WITH_EXTRACTOR: ReadonlySet<CaptureType> = new Set([
  'whatsapp_chat',
  'whatsapp_web',
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
    if (!detection || !file) return
    setProcessLoading(true)
    setProcessError(null)
    setProcessed(null)
    try {
      const r = await processCapture({
        file,
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
  }, [detection, file, selectedPersonId])

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
          SIR V2 &middot; Captura
        </div>
        <div className="flex items-center gap-3">
          <Camera size={20} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Capturar un pantallazo
          </h1>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">
          Subí un pantallazo de un chat de <span className="text-foreground">WhatsApp</span> o de
          un perfil de <span className="text-foreground">Instagram</span> /{' '}
          <span className="text-foreground">LinkedIn</span>. SIR detecta el tipo, extrae los datos
          y los asocia a una persona de tus relaciones.
        </p>
      </header>

      {/* Guía de primer uso: 3 pasos, visible antes de subir nada. */}
      <ol className="mb-6 grid gap-2 sm:grid-cols-3">
        {[
          { n: 1, t: 'Elegí la imagen', d: 'Un pantallazo de WhatsApp, Instagram o LinkedIn.' },
          { n: 2, t: 'Vinculá la persona', d: 'SIR sugiere a quién pertenece; confirmás o creás una.' },
          { n: 3, t: 'Guardá', d: 'Los datos quedan en el perfil de esa persona.' },
        ].map((s) => (
          <li key={s.n} className="rounded-md border border-border/50 bg-muted/10 p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-5 h-5 rounded-full bg-accent/15 text-accent-foreground text-[11px] font-mono flex items-center justify-center">
                {s.n}
              </span>
              <span className="text-xs font-medium">{s.t}</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{s.d}</p>
          </li>
        ))}
      </ol>

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
                  detección: {(detection.originalBytes / 1024).toFixed(0)} KB →{' '}
                  {(detection.compressedBytes / 1024).toFixed(0)} KB · q=
                  {detection.detectionQuality.toFixed(2)}
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
                3. Guardar la captura
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
              Esta imagen se detectó como{' '}
              <span className="font-mono">{detection.detected.type}</span>, que todavía no se puede
              extraer automáticamente. Probá con un pantallazo de un chat de WhatsApp o de un perfil
              de Instagram / LinkedIn.
            </p>
          </CardContent>
        </Card>
      )}
    </AppShell>
  )
}

function ProcessedView({ result }: { result: ProcessCaptureResponse }) {
  const [obs, setObs] = useState<Observation>(result.observation)
  const [candidates, setCandidates] = useState<PersonCandidate[]>(result.matchCandidates)
  const [linkLoading, setLinkLoading] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<ErrorState | null>(null)

  // Crear persona nueva — prellenado con extractor fields.
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState(() =>
    extractInitialName(result.observation.captureType, result.extracted),
  )
  const [createLoading, setCreateLoading] = useState(false)

  const onLink = useCallback(
    async (personId: string) => {
      setLinkLoading(personId)
      setLinkError(null)
      try {
        const r = await linkObservationToPerson(obs.id, personId)
        setObs(r.observation)
      } catch (e) {
        if (e instanceof HttpError) {
          setLinkError({ status: e.status, message: e.message, detail: e.detail })
        } else {
          const msg = e instanceof Error ? e.message : String(e)
          setLinkError({ status: 0, message: msg })
        }
      } finally {
        setLinkLoading(null)
      }
    },
    [obs.id],
  )

  const onUnlink = useCallback(async () => {
    setLinkLoading('__unlink__')
    setLinkError(null)
    try {
      const r = await linkObservationToPerson(obs.id, null)
      setObs(r.observation)
    } catch (e) {
      if (e instanceof HttpError) {
        setLinkError({ status: e.status, message: e.message, detail: e.detail })
      } else {
        const msg = e instanceof Error ? e.message : String(e)
        setLinkError({ status: 0, message: msg })
      }
    } finally {
      setLinkLoading(null)
    }
  }, [obs.id])

  const onCreateAndLink = useCallback(async () => {
    const trimmed = createName.trim()
    if (!trimmed) return
    setCreateLoading(true)
    setLinkError(null)
    try {
      const created = await createPerson({
        name: trimmed,
        ...extractContactFields(result.observation.captureType, result.extracted),
      })
      const linked = await linkObservationToPerson(obs.id, created.person.id)
      setObs(linked.observation)
      // Prepend la nueva persona a candidates para mantener contexto.
      setCandidates((curr) => [
        {
          id: created.person.id,
          name: created.person.name,
          slug: created.person.slug,
          alias: created.person.alias,
          relationship: created.person.relationship,
          category: created.person.category,
          importance_score: created.person.importance_score,
          instagram_handle: created.person.instagram_handle,
          linkedin_url: created.person.linkedin_url,
          phone_number: created.person.phone_number,
          matchScore: 100,
          matchReason: 'just_created',
        },
        ...curr,
      ])
      setShowCreate(false)
    } catch (e) {
      if (e instanceof HttpError) {
        setLinkError({ status: e.status, message: e.message, detail: e.detail })
      } else {
        const msg = e instanceof Error ? e.message : String(e)
        setLinkError({ status: 0, message: msg })
      }
    } finally {
      setCreateLoading(false)
    }
  }, [createName, obs.id, result.observation.captureType, result.extracted])

  const linkedPersonName =
    obs.personId
      ? candidates.find((c) => c.id === obs.personId)?.name ?? '(persona vinculada)'
      : null

  return (
    <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge className="text-[10px] font-mono uppercase tracking-wider">Guardado</Badge>
        <span className="text-xs font-mono text-foreground break-all min-w-0">{obs.id}</span>
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
        {result.autoLinked && (
          <Badge variant="secondary" className="text-[10px] font-mono">
            auto-link · {result.autoLinked.reason}
          </Badge>
        )}
      </div>

      {/* PERSONA VINCULADA */}
      {obs.personId ? (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} className="text-emerald-400" />
            <span className="text-foreground font-medium">{linkedPersonName}</span>
            <span className="font-mono text-muted-foreground/70">{obs.personId}</span>
          </div>
          <button
            type="button"
            onClick={onUnlink}
            disabled={linkLoading !== null}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
            aria-label="Desvincular persona"
          >
            {linkLoading === '__unlink__' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <X size={14} />
            )}
          </button>
        </div>
      ) : (
        <PostSaveMatcher
          candidates={candidates}
          onLink={onLink}
          linkLoading={linkLoading}
          showCreate={showCreate}
          setShowCreate={setShowCreate}
          createName={createName}
          setCreateName={setCreateName}
          createLoading={createLoading}
          onCreateAndLink={onCreateAndLink}
        />
      )}

      {linkError && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-xs">
          <div className="font-medium text-red-400">
            Error HTTP {linkError.status}: {linkError.message}
          </div>
          {linkError.detail && (
            <div className="text-muted-foreground">{linkError.detail}</div>
          )}
        </div>
      )}

      <div className="text-xs text-muted-foreground space-y-1 break-words">
        <div>
          <span className="font-medium text-foreground">person_id:</span>{' '}
          <span className="font-mono break-all">{obs.personId ?? '(null)'}</span>
        </div>
        <div>
          <span className="font-medium text-foreground">storage:</span>{' '}
          <span className="font-mono break-all">
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
        <div className="pt-2 mt-2 border-t border-border/50">
          <span className="font-medium text-foreground">compresión extractor:</span>{' '}
          <span className="font-mono">
            {(result.compression.originalBytes / 1024).toFixed(0)} KB →{' '}
            {(result.compression.compressedBytes / 1024).toFixed(0)} KB · q={' '}
            {result.compression.finalQuality.toFixed(2)} (target{' '}
            {result.compression.targetQuality.toFixed(2)}) · {result.compression.maxWidth}px ·{' '}
            {result.compression.attempts} pase{result.compression.attempts === 1 ? '' : 's'}
          </span>
          {result.compression.hitCeiling && (
            <span className="ml-2 text-yellow-400 font-mono">⚠ techo q=0.98 sin alcanzar piso</span>
          )}
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

function PostSaveMatcher({
  candidates,
  onLink,
  linkLoading,
  showCreate,
  setShowCreate,
  createName,
  setCreateName,
  createLoading,
  onCreateAndLink,
}: {
  candidates: PersonCandidate[]
  onLink: (id: string) => void
  linkLoading: string | null
  showCreate: boolean
  setShowCreate: (v: boolean) => void
  createName: string
  setCreateName: (v: string) => void
  createLoading: boolean
  onCreateAndLink: () => void
}) {
  return (
    <div className="rounded-md border border-border bg-background/60 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <Users size={14} className="text-muted-foreground/70" />
        <h3 className="text-xs font-semibold tracking-tight">
          ¿Es alguna de estas personas?
        </h3>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
          matcher post-extracción
        </span>
      </div>

      {candidates.length > 0 ? (
        <ul className="space-y-1.5 max-h-72 overflow-y-auto">
          {candidates.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onLink(c.id)}
                disabled={linkLoading !== null}
                className="w-full text-left rounded border border-border hover:border-accent/50 px-3 py-2 text-xs flex items-center justify-between gap-3 disabled:opacity-50"
              >
                <div>
                  <div className="font-medium text-foreground">{c.name}</div>
                  <div className="text-muted-foreground font-mono text-[10px]">
                    {c.slug ?? c.id}
                    {c.alias && ` · alias: ${c.alias}`}
                    {c.instagram_handle && ` · @${c.instagram_handle}`}
                    {c.phone_number && ` · ${c.phone_number}`}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    {c.matchReason} {c.matchScore}
                  </Badge>
                  {linkLoading === c.id && <Loader2 size={12} className="animate-spin" />}
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-xs text-muted-foreground italic">
          Sin coincidencias en tus personas con los campos del extractor.
        </div>
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
              disabled={createLoading}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={onCreateAndLink}
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
          <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
            <UserPlus size={14} className="mr-2" />
            Crear persona nueva (prellenado del extractor)
          </Button>
        )}
      </div>
    </div>
  )
}

/** Saca el mejor nombre disponible del output del extractor para
 *  pre-poblar el form de "crear persona nueva". */
function extractInitialName(
  captureType: CaptureType,
  extracted: Record<string, unknown>,
): string {
  const read = (k: string) =>
    typeof extracted[k] === 'string' ? (extracted[k] as string).trim() : ''
  switch (captureType) {
    case 'linkedin':
      return read('fullName')
    case 'instagram':
      return read('displayName') || read('handle')
    case 'whatsapp_info':
      return read('displayName')
    case 'whatsapp_chat':
    case 'whatsapp_web':
      return read('personName')
    default:
      return ''
  }
}

/** Mapea los campos del extractor a los campos opcionales que acepta
 *  POST /api/people para "crear persona nueva" prellenado. */
function extractContactFields(
  captureType: CaptureType,
  extracted: Record<string, unknown>,
): {
  instagram_handle?: string
  linkedin_url?: string
  phone_number?: string
} {
  const read = (k: string) =>
    typeof extracted[k] === 'string' && (extracted[k] as string).trim().length > 0
      ? (extracted[k] as string).trim()
      : undefined

  switch (captureType) {
    case 'linkedin':
      // Hoy el extractor LinkedIn no devuelve URL del perfil — queda en
      // null. Futura iteracion: agregar al schema B.4.
      return {}
    case 'instagram':
      return { instagram_handle: read('handle') }
    case 'whatsapp_info':
      return { phone_number: read('phoneNumber') }
    case 'whatsapp_web':
      // Web sí expone el teléfono del panel derecho cuando está abierto.
      return { phone_number: read('phoneNumber') }
    case 'whatsapp_chat':
      return {}
    default:
      return {}
  }
}
