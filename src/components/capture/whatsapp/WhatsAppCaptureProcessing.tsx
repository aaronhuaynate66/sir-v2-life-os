'use client'
// SIR V2 — Step 2: loading mientras Sonnet Vision procesa la conversacion.

import { Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface WhatsAppCaptureProcessingProps {
  /** Object URL del blob comprimido para mostrar thumbnail. */
  previewUrl: string
}

export function WhatsAppCaptureProcessing({ previewUrl }: WhatsAppCaptureProcessingProps) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row items-center gap-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL no es optimizable por next/image */}
        <img
          src={previewUrl}
          alt="Captura de WhatsApp"
          className="w-32 h-48 object-cover rounded-md border border-border"
        />
        <div className="flex-1 flex flex-col items-center sm:items-start gap-2 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <Loader2 size={16} className="animate-spin text-primary" aria-hidden="true" />
            <span className="text-sm font-medium text-foreground">Analizando conversación con IA…</span>
          </div>
          <p className="text-xs text-muted-foreground max-w-md">
            Esto toma 5-15 segundos. Claude Sonnet 4.5 extrae los mensajes,
            identifica el contacto del header, infiere el tono emocional,
            y resume la conversación de forma observacional.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
