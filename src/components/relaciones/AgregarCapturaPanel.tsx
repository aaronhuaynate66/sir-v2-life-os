'use client'
// SIR V2 — AgregarCapturaPanel: captura EN CONTEXTO de una persona.
//
// Aaron quería subir una captura desde el detalle de la persona y que se
// asocie DIRECTO a ella, sin re-seleccionar en /captura. Acá la persona está
// FIJA: subís la imagen, el detector universal reconoce el tipo y, si es un
// tipo asociable (whatsapp/instagram/linkedin), se procesa y queda en el
// perfil de ESTA persona — sin matcher.
//
// Reusa el pipeline existente sin duplicarlo: detectCaptureType (detector) +
// processCapture (extract + storage + insert, con person_id fijo). NO toca el
// god-component /captura ni su flujo genérico. La báscula es self (health_
// metrics, sin persona): si se detecta, avisamos y derivamos al flujo propio.

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Camera, Loader2, Check, ArrowRight, Scale, AlertCircle } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ApiErrorNotice } from '@/components/ui/api-error-notice'
import { detectCaptureType, DetectorError } from '@/lib/capture/detector/client'
import { processCapture, HttpError } from '@/lib/capture/observations/client'
import { planPersonCapture } from '@/lib/capture/person-capture'
import type { CaptureType } from '@/lib/capture/observations/types'

type Phase = 'idle' | 'working' | 'done' | 'scale' | 'unsupported'

interface ErrorState {
  status: number
  message: string
  detail?: string
}

const TYPE_LABEL: Partial<Record<CaptureType, string>> = {
  whatsapp_chat: 'WhatsApp',
  whatsapp_web: 'WhatsApp',
  whatsapp_info: 'WhatsApp',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
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

  const reset = useCallback(() => {
    setFile(null)
    setPhase('idle')
    setError(null)
    setSavedType(null)
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null)
    setPhase('idle')
    setError(null)
    setSavedType(null)
  }, [])

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

      // plan.kind === 'link' → procesar con la persona FIJA (sin matcher).
      await processCapture({
        file,
        captureType: type,
        detectorData: detection.detected,
        personId,
      })
      setSavedType(type)
      setPhase('done')
      router.refresh() // refresca observations server-fetched (Bitácora, Vida…)
    } catch (e) {
      if (e instanceof DetectorError || e instanceof HttpError) {
        setError({ status: e.status, message: e.message, detail: e.detail })
      } else {
        setError({ status: 0, message: e instanceof Error ? e.message : String(e) })
      }
      setPhase('idle')
    }
  }, [file, personId, router])

  const working = phase === 'working'

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-1">
          <Camera size={15} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
            Agregar captura
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Capturando para <span className="font-medium text-foreground">{personName}</span> — se asocia
          directo a su perfil (sin re-seleccionar).
        </p>

        {phase === 'done' ? (
          <div className="space-y-3">
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs flex items-center gap-2">
              <Check size={14} strokeWidth={2} className="text-emerald-400 flex-shrink-0" aria-hidden="true" />
              <span className="text-emerald-400">
                {savedType && TYPE_LABEL[savedType] ? `Captura de ${TYPE_LABEL[savedType]}` : 'Captura'} guardada
                y asociada a {personName}.
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={reset} className="w-full">
              Agregar otra captura
            </Button>
          </div>
        ) : phase === 'scale' ? (
          <div className="space-y-3">
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs flex items-start gap-2">
              <Scale size={14} strokeWidth={1.75} className="text-amber-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-amber-300/90">
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
                  Detectando y guardando…
                </>
              ) : (
                'Subir y guardar'
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
