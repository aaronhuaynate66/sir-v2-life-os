'use client'
// SIR V2 — ScaleCaptureFlow: orquestador de los 4 steps de captura báscula.
//
// Estados:
//   - upload: usuario va a elegir un archivo
//   - processing: comprimiendo + llamando Vision
//   - preview: extracción lista, usuario edita y confirma
//   - saving: subiendo a Storage + insertando 13 rows
//   - success: confirmación final
//   - error: mostrar mensaje + dejar reintentar
//
// Cleanup: revoca objectURL de la imagen al desmontar.

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, RotateCw } from 'lucide-react'
import { toast } from 'sonner'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

import { ScaleCaptureUploader } from './ScaleCaptureUploader'
import { ScaleCaptureProcessing } from './ScaleCaptureProcessing'
import { ScaleCapturePreview } from './ScaleCapturePreview'
import { ScaleCaptureSuccess } from './ScaleCaptureSuccess'

import { compressImage } from '@/lib/capture/scale/compress'
import { extractScaleCapture, persistScaleCapture } from '@/lib/capture/scale/client'
import type { ScaleCaptureExtracted, ScaleMetric } from '@/lib/capture/scale/types'

type Step =
  | { kind: 'upload' }
  | { kind: 'processing'; previewUrl: string; blob: Blob }
  | { kind: 'preview'; previewUrl: string; blob: Blob; extracted: ScaleCaptureExtracted }
  | { kind: 'saving'; previewUrl: string; blob: Blob; extracted: ScaleCaptureExtracted }
  | { kind: 'success'; insertedCount: number }
  | { kind: 'error'; message: string; previewUrl?: string; blob?: Blob }

export function ScaleCaptureFlow() {
  const [step, setStep] = useState<Step>({ kind: 'upload' })
  const objectUrlsRef = useRef<Set<string>>(new Set())
  const fileModifiedRef = useRef<string | null>(null)

  // Revocar URLs creadas al desmontar. Capturamos la referencia al Set
  // en mount; sigue siendo la misma instancia toda la vida del componente
  // (mutamos en .add(), no reasignamos .current).
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

  const goUpload = useCallback(() => setStep({ kind: 'upload' }), [])

  const handleFile = useCallback(
    async (file: File) => {
      try {
        fileModifiedRef.current = Number.isFinite(file.lastModified) ? new Date(file.lastModified).toISOString() : null
        const compressed = await compressImage(file)
        const url = makeUrl(compressed.blob)
        setStep({ kind: 'processing', previewUrl: url, blob: compressed.blob })

        const extracted = await extractScaleCapture(compressed.blob)
        setStep({ kind: 'preview', previewUrl: url, blob: compressed.blob, extracted })
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Error inesperado al procesar la imagen.'
        setStep({ kind: 'error', message })
      }
    },
    [makeUrl],
  )

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
        // Volver al preview con la misma extracción para que el usuario pueda reintentar
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

  // ─── render ──────────────────────────────────────────────────────

  if (step.kind === 'upload') {
    return <ScaleCaptureUploader onFile={handleFile} />
  }

  if (step.kind === 'processing') {
    return <ScaleCaptureProcessing previewUrl={step.previewUrl} />
  }

  if (step.kind === 'preview' || step.kind === 'saving') {
    return (
      <ScaleCapturePreview
        fallbackIso={fileModifiedRef.current}
        previewUrl={step.previewUrl}
        extracted={step.extracted}
        saving={step.kind === 'saving'}
        onCancel={goUpload}
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
    return <ScaleCaptureSuccess insertedCount={step.insertedCount} onAnother={goUpload} />
  }

  // error
  return (
    <Card className="shadow-none">
      <CardContent className="p-6 flex flex-col items-center text-center gap-4">
        <div className="w-12 h-12 rounded-full bg-bad-soft border border-bad/30 flex items-center justify-center">
          <AlertCircle size={20} strokeWidth={1.75} className="text-bad" aria-hidden="true" />
        </div>
        <div className="space-y-1 max-w-md">
          <h2 className="text-base font-semibold tracking-tight text-foreground">Hubo un problema</h2>
          <p className="text-sm text-muted-foreground">{step.message}</p>
        </div>
        <Button size="sm" variant="outline" onClick={goUpload}>
          <RotateCw size={14} strokeWidth={1.75} className="mr-1.5" />
          Reintentar
        </Button>
      </CardContent>
    </Card>
  )
}
