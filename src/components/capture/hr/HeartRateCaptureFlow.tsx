'use client'
// SIR V2 — HeartRateCaptureFlow: orquestador de la captura de panel de FC desde
// su propia página (/captura/fc). Estados: upload → processing → preview →
// success/error. Reusa la compresión de scale + /api/capture/hr.

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, RotateCw } from 'lucide-react'
import { toast } from 'sonner'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

import { HeartRateCaptureUploader } from './HeartRateCaptureUploader'
import { HeartRateCaptureProcessing } from './HeartRateCaptureProcessing'
import { HeartRateCapturePreview } from './HeartRateCapturePreview'
import { HeartRateCaptureSuccess } from './HeartRateCaptureSuccess'

import { compressImage } from '@/lib/capture/scale/compress'
import {
  extractHeartRatePanel,
  persistHeartRateCapture,
  todayInLima,
  type PersistHeartRateResult,
} from '@/lib/capture/hr/client'
import type { HeartRateCaptureFinal, HeartRatePanelExtracted } from '@/lib/capture/hr/types'

type Step =
  | { kind: 'upload' }
  | { kind: 'processing'; previewUrl: string }
  | { kind: 'preview'; previewUrl: string; extracted: HeartRatePanelExtracted }
  | { kind: 'success'; result: PersistHeartRateResult }
  | { kind: 'error'; message: string }

export function HeartRateCaptureFlow() {
  const [step, setStep] = useState<Step>({ kind: 'upload' })
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

  const goUpload = useCallback(() => setStep({ kind: 'upload' }), [])

  const handleFile = useCallback(
    async (file: File) => {
      try {
        const compressed = await compressImage(file, { maxSize: 1280, quality: 0.9 })
        const url = makeUrl(compressed.blob)
        setStep({ kind: 'processing', previewUrl: url })

        const extracted = await extractHeartRatePanel(compressed.blob)
        setStep({ kind: 'preview', previewUrl: url, extracted })
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Error inesperado al procesar la imagen.'
        setStep({ kind: 'error', message })
      }
    },
    [makeUrl],
  )

  const handleConfirm = useCallback((final: HeartRateCaptureFinal) => {
    try {
      const result = persistHeartRateCapture(final)
      toast.success(result.replaced ? 'FC actualizada' : 'FC guardada')
      setStep({ kind: 'success', result })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Falló al guardar.'
      toast.error('No se pudo guardar', { description: message })
    }
  }, [])

  if (step.kind === 'upload') {
    return <HeartRateCaptureUploader onFile={handleFile} />
  }

  if (step.kind === 'processing') {
    return <HeartRateCaptureProcessing previewUrl={step.previewUrl} />
  }

  if (step.kind === 'preview') {
    return (
      <HeartRateCapturePreview
        previewUrl={step.previewUrl}
        extracted={step.extracted}
        fallbackDay={todayInLima()}
        saving={false}
        onCancel={goUpload}
        onConfirm={handleConfirm}
      />
    )
  }

  if (step.kind === 'success') {
    return (
      <HeartRateCaptureSuccess
        day={step.result.day}
        restingBpm={step.result.restingBpm}
        insertedCount={step.result.insertedCount}
        replaced={step.result.replaced}
        onAnother={goUpload}
      />
    )
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
