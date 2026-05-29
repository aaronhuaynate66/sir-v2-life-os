'use client'
// SIR V2 — Orquestador de captura WhatsApp.
//
// State machine de 4 steps: upload → processing → preview → success.
// Errores en cualquier step muestran la pantalla de error con retry.

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, RotateCw } from 'lucide-react'
import { toast } from 'sonner'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

import { WhatsAppCaptureUploader } from './WhatsAppCaptureUploader'
import { WhatsAppCaptureProcessing } from './WhatsAppCaptureProcessing'
import { WhatsAppCapturePreview } from './WhatsAppCapturePreview'
import { WhatsAppCaptureSuccess } from './WhatsAppCaptureSuccess'

import { compressImage } from '@/lib/capture/scale/compress'
import { extractWhatsAppCapture, persistWhatsAppCapture } from '@/lib/capture/whatsapp/client'
import { useRelationshipStore } from '@/stores/useRelationshipStore'
import type { WhatsAppCaptureExtracted } from '@/lib/capture/whatsapp/types'

type Step =
  | { kind: 'upload' }
  | { kind: 'processing'; previewUrl: string; blob: Blob }
  | {
      kind: 'preview'
      previewUrl: string
      blob: Blob
      extracted: WhatsAppCaptureExtracted
    }
  | {
      kind: 'saving'
      previewUrl: string
      blob: Blob
      extracted: WhatsAppCaptureExtracted
    }
  | {
      kind: 'success'
      personId: string
      personName: string
      personSlug?: string
      topicsCount: number
      messagesCount: number
      confidence: 'high' | 'medium' | 'low'
    }
  | { kind: 'error'; message: string }

export function WhatsAppCaptureFlow() {
  const [step, setStep] = useState<Step>({ kind: 'upload' })
  const { people } = useRelationshipStore()
  const objectUrlsRef = useRef<Set<string>>(new Set())

  // Cleanup objectURLs al desmontar.
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
    async (file: File, reflection: boolean) => {
      try {
        // Compresion + extract en serie. previewUrl se hace despues de comprimir
        // para que el thumbnail muestre lo que realmente subimos.
        const compressed = await compressImage(file, { maxSize: 1280, quality: 0.85 })
        const url = makeUrl(compressed.blob)
        setStep({ kind: 'processing', previewUrl: url, blob: compressed.blob })

        const extracted = await extractWhatsAppCapture(compressed.blob, reflection)

        // Edge case: Vision retorno confidence low + personName vacio (no es
        // un screenshot de WhatsApp). Tratar como error explicito.
        if (extracted.confidence === 'low' && !extracted.personName) {
          setStep({
            kind: 'error',
            message:
              'No pude leer el screenshot. Probá una imagen más nítida o asegurate de que sea una conversación de WhatsApp.',
          })
          return
        }

        setStep({ kind: 'preview', previewUrl: url, blob: compressed.blob, extracted })
      } catch (e) {
        const message =
          e instanceof Error ? e.message : 'Error inesperado al procesar la imagen.'
        setStep({ kind: 'error', message })
      }
    },
    [makeUrl],
  )

  const handleConfirm = useCallback(
    async (args: {
      previewUrl: string
      blob: Blob
      extracted: WhatsAppCaptureExtracted
      personId: string
      conversationDate: string
      finalExtracted: WhatsAppCaptureExtracted
    }) => {
      setStep({
        kind: 'saving',
        previewUrl: args.previewUrl,
        blob: args.blob,
        extracted: args.extracted,
      })
      try {
        await persistWhatsAppCapture({
          extracted: args.finalExtracted,
          personId: args.personId,
          conversationDate: args.conversationDate,
          imageBlob: args.blob,
        })
        // Encontrar info de la persona para el success screen.
        const person = people.find((p) => p.id === args.personId)
        toast.success('Captura guardada', {
          description: person ? `Historial de ${person.name} actualizado.` : undefined,
        })
        setStep({
          kind: 'success',
          personId: args.personId,
          personName: person?.name ?? 'la persona',
          personSlug: person?.slug,
          topicsCount: args.finalExtracted.topics.length,
          messagesCount: args.finalExtracted.rawMessages.length,
          confidence: args.finalExtracted.confidence,
        })
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Falló al guardar.'
        toast.error('No se pudo guardar', { description: message })
        // Vuelve al preview con la misma extraccion para reintentar sin re-procesar.
        setStep({
          kind: 'preview',
          previewUrl: args.previewUrl,
          blob: args.blob,
          extracted: args.extracted,
        })
      }
    },
    [people],
  )

  // ─── render ──────────────────────────────────────────────────────

  if (step.kind === 'upload') {
    return <WhatsAppCaptureUploader onFile={handleFile} />
  }

  if (step.kind === 'processing') {
    return <WhatsAppCaptureProcessing previewUrl={step.previewUrl} />
  }

  if (step.kind === 'preview' || step.kind === 'saving') {
    return (
      <WhatsAppCapturePreview
        previewUrl={step.previewUrl}
        extracted={step.extracted}
        saving={step.kind === 'saving'}
        onCancel={goUpload}
        onConfirm={({ personId, conversationDate, finalExtracted }) =>
          handleConfirm({
            previewUrl: step.previewUrl,
            blob: step.blob,
            extracted: step.extracted,
            personId,
            conversationDate,
            finalExtracted,
          })
        }
      />
    )
  }

  if (step.kind === 'success') {
    return (
      <WhatsAppCaptureSuccess
        personName={step.personName}
        personSlug={step.personSlug}
        topicsCount={step.topicsCount}
        messagesCount={step.messagesCount}
        confidence={step.confidence}
        onAnother={goUpload}
      />
    )
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
        <Button size="sm" variant="outline" onClick={goUpload}>
          <RotateCw size={14} strokeWidth={1.75} className="mr-1.5" />
          Volver a subir
        </Button>
      </CardContent>
    </Card>
  )
}
