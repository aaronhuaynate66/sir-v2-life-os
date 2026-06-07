'use client'
// SIR V2 — HeartRateCaptureBranch: sub-flujo de panel de FC dentro del pipeline
// universal de /captura.
//
// Cuando el detector universal clasifica un pantallazo como `heart_rate_panel`,
// /captura monta este componente con el File YA elegido (no re-pide upload).
// Reusa la compresión de scale y el endpoint /api/capture/hr:
//   compressImage -> extractHeartRatePanel -> preview editable ->
//   persistHeartRateCapture (health_metrics, dedupe por día).
//
// Es data propia (capa biológica, self): NO se vincula a una persona. La FC de
// reposo queda en /yo como tu FC actual (verdad), y el rango como métricas
// separadas (FC mín/máx).

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, RotateCw } from 'lucide-react'
import { toast } from 'sonner'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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
  | { kind: 'processing'; previewUrl: string }
  | { kind: 'preview'; previewUrl: string; extracted: HeartRatePanelExtracted }
  | { kind: 'success'; result: PersistHeartRateResult }
  | { kind: 'error'; message: string }

interface HeartRateCaptureBranchProps {
  /** Imagen ya elegida en /captura (la misma que se detectó como heart_rate_panel). */
  file: File
  /** Permite al usuario volver a empezar con otro archivo desde /captura. */
  onReset: () => void
}

export function HeartRateCaptureBranch({ file, onReset }: HeartRateCaptureBranchProps) {
  const [step, setStep] = useState<Step>({ kind: 'processing', previewUrl: '' })
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

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const compressed = await compressImage(file, { maxSize: 1280, quality: 0.9 })
        if (cancelled) return
        const url = makeUrl(compressed.blob)
        setStep({ kind: 'processing', previewUrl: url })

        const extracted = await extractHeartRatePanel(compressed.blob)
        if (cancelled) return
        setStep({ kind: 'preview', previewUrl: url, extracted })
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
        onCancel={onReset}
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
        onAnother={onReset}
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
        <Button size="sm" variant="outline" onClick={onReset}>
          <RotateCw size={14} strokeWidth={1.75} className="mr-1.5" />
          Reintentar
        </Button>
      </CardContent>
    </Card>
  )
}
