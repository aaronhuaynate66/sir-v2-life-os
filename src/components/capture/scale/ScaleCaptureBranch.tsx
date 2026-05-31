'use client'
// SIR V2 — ScaleCaptureBranch: sub-flujo de báscula dentro del pipeline
// universal de /captura.
//
// Cuando el detector universal clasifica un pantallazo como `scale`, /captura
// monta este componente con el File YA elegido (no re-pide upload). Reusa
// toda la infra de báscula:
//   compressImage -> extractScaleCapture (/api/capture/scale) -> preview
//   editable -> persistScaleCapture (health_metrics, captureType='scale').
//
// A diferencia del pipeline de observations, la báscula NO se vincula a una
// persona: mide al propio usuario. Por eso no hay matcher acá. El peso queda
// trackeable para el chart de tendencia de /yo.

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, RotateCw } from 'lucide-react'
import { toast } from 'sonner'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

import { ScaleCaptureProcessing } from './ScaleCaptureProcessing'
import { ScaleCapturePreview } from './ScaleCapturePreview'
import { ScaleCaptureSuccess } from './ScaleCaptureSuccess'

import { compressImage } from '@/lib/capture/scale/compress'
import { extractScaleCapture, persistScaleCapture } from '@/lib/capture/scale/client'
import type { ScaleCaptureExtracted, ScaleMetric } from '@/lib/capture/scale/types'

type Step =
  | { kind: 'processing'; previewUrl: string; blob: Blob }
  | { kind: 'preview'; previewUrl: string; blob: Blob; extracted: ScaleCaptureExtracted }
  | { kind: 'saving'; previewUrl: string; blob: Blob; extracted: ScaleCaptureExtracted }
  | { kind: 'success'; insertedCount: number }
  | { kind: 'error'; message: string }

interface ScaleCaptureBranchProps {
  /** Imagen ya elegida en /captura (la misma que se detectó como scale). */
  file: File
  /** Permite al usuario volver a empezar con otro archivo desde /captura. */
  onReset: () => void
}

export function ScaleCaptureBranch({ file, onReset }: ScaleCaptureBranchProps) {
  const [step, setStep] = useState<Step>({ kind: 'processing', previewUrl: '', blob: file })
  const objectUrlsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const set = objectUrlsRef.current
    return () => {
      for (const url of set) URL.revokeObjectURL(url)
      set.clear()
    }
  }, [])

  const makeUrl = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob)
    objectUrlsRef.current.add(url)
    return url
  }, [])

  // Arranca el procesamiento en cuanto cambia el File entrante.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const compressed = await compressImage(file)
        if (cancelled) return
        const url = makeUrl(compressed.blob)
        setStep({ kind: 'processing', previewUrl: url, blob: compressed.blob })

        const extracted = await extractScaleCapture(compressed.blob)
        if (cancelled) return
        setStep({ kind: 'preview', previewUrl: url, blob: compressed.blob, extracted })
      } catch (e) {
        if (cancelled) return
        const message = e instanceof Error ? e.message : 'Error inesperado al procesar la imagen.'
        setStep({ kind: 'error', message })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [file, makeUrl])

  const handleConfirm = useCallback(
    async (args: {
      previewUrl: string
      blob: Blob
      extracted: ScaleCaptureExtracted
      finalMetrics: Partial<Record<ScaleMetric, number>>
      measuredAt: string
    }) => {
      setStep({
        kind: 'saving',
        previewUrl: args.previewUrl,
        blob: args.blob,
        extracted: args.extracted,
      })
      try {
        const result = await persistScaleCapture({
          finalMetrics: args.finalMetrics,
          measuredAt: args.measuredAt,
          imageBlob: args.blob,
          confidence: args.extracted.confidence,
        })
        toast.success(`${result.insertedCount} métricas guardadas`)
        setStep({ kind: 'success', insertedCount: result.insertedCount })
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Falló al guardar.'
        toast.error('No se pudo guardar', { description: message })
        setStep({
          kind: 'preview',
          previewUrl: args.previewUrl,
          blob: args.blob,
          extracted: args.extracted,
        })
      }
    },
    [],
  )

  if (step.kind === 'processing') {
    return <ScaleCaptureProcessing previewUrl={step.previewUrl} />
  }

  if (step.kind === 'preview' || step.kind === 'saving') {
    return (
      <ScaleCapturePreview
        previewUrl={step.previewUrl}
        extracted={step.extracted}
        saving={step.kind === 'saving'}
        onCancel={onReset}
        onConfirm={({ finalMetrics, measuredAt }) =>
          handleConfirm({
            previewUrl: step.previewUrl,
            blob: step.blob,
            extracted: step.extracted,
            finalMetrics,
            measuredAt,
          })
        }
      />
    )
  }

  if (step.kind === 'success') {
    return <ScaleCaptureSuccess insertedCount={step.insertedCount} onAnother={onReset} />
  }

  // error
  return (
    <Card className="shadow-none">
      <CardContent className="p-6 flex flex-col items-center text-center gap-4">
        <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
          <AlertCircle size={20} strokeWidth={1.75} className="text-red-400" aria-hidden="true" />
        </div>
        <div className="space-y-1 max-w-md">
          <h2 className="text-base font-semibold tracking-tight text-foreground">Hubo un problema</h2>
          <p className="text-sm text-muted-foreground">{step.message}</p>
        </div>
        <Button size="sm" variant="outline" onClick={onReset}>
          <RotateCw size={14} strokeWidth={1.75} className="mr-1.5" />
          Reintentar
        </Button>
      </CardContent>
    </Card>
  )
}
