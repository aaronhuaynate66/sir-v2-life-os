'use client'
// SIR V2 — SleepCaptureBranch: sub-flujo de panel de sueño dentro del pipeline
// universal de /captura.
//
// Cuando el detector universal clasifica un pantallazo como `sleep_panel`,
// /captura monta este componente con el File YA elegido (no re-pide upload).
// Reusa la compresión de scale y el endpoint /api/capture/sleep:
//   compressImage -> extractSleepPanel -> preview editable -> persistSleepCapture
//   (sleep_records, dedupe por día).
//
// Es data propia (capa biológica, self): NO se vincula a una persona. El sueño
// queda en /yo (Sueño prom., Calidad sueño, Deuda sueño) + chart de horas.

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, RotateCw } from 'lucide-react'
import { toast } from 'sonner'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

import { SleepCaptureProcessing } from './SleepCaptureProcessing'
import { SleepCapturePreview } from './SleepCapturePreview'
import { SleepCaptureSuccess } from './SleepCaptureSuccess'

import { compressImage } from '@/lib/capture/scale/compress'
import {
  extractSleepPanel,
  persistSleepCapture,
  todayInLima,
  type PersistSleepResult,
} from '@/lib/capture/sleep/client'
import type { SleepCaptureFinal, SleepPanelExtracted } from '@/lib/capture/sleep/types'

type Step =
  | { kind: 'processing'; previewUrl: string }
  | { kind: 'preview'; previewUrl: string; extracted: SleepPanelExtracted }
  | { kind: 'success'; result: PersistSleepResult }
  | { kind: 'error'; message: string }

interface SleepCaptureBranchProps {
  /** Imagen ya elegida en /captura (la misma que se detectó como sleep_panel). */
  file: File
  /** Permite al usuario volver a empezar con otro archivo desde /captura. */
  onReset: () => void
}

export function SleepCaptureBranch({ file, onReset }: SleepCaptureBranchProps) {
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

        const extracted = await extractSleepPanel(compressed.blob)
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

  const handleConfirm = useCallback((final: SleepCaptureFinal) => {
    try {
      const result = persistSleepCapture(final)
      toast.success(result.replaced ? 'Noche actualizada' : 'Sueño guardado')
      setStep({ kind: 'success', result })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Falló al guardar.'
      toast.error('No se pudo guardar', { description: message })
    }
  }, [])

  if (step.kind === 'processing') {
    return <SleepCaptureProcessing previewUrl={step.previewUrl} />
  }

  if (step.kind === 'preview') {
    return (
      <SleepCapturePreview
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
      <SleepCaptureSuccess
        day={step.result.day}
        durationHours={step.result.durationHours}
        quality={step.result.quality}
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
