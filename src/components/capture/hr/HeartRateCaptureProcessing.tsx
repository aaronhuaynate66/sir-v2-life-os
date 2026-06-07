'use client'
// SIR V2 — Loading mientras Vision procesa el panel de frecuencia cardíaca.

import { Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface HeartRateCaptureProcessingProps {
  /** URL local (createObjectURL) del blob comprimido para mostrar thumbnail. */
  previewUrl: string
}

export function HeartRateCaptureProcessing({ previewUrl }: HeartRateCaptureProcessingProps) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row items-center gap-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL no es optimizable por next/image */}
        <img
          src={previewUrl}
          alt="Captura de frecuencia cardíaca"
          className="w-32 h-32 object-cover rounded-md border border-border"
        />
        <div className="flex-1 flex flex-col items-center sm:items-start gap-2 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <Loader2 size={16} className="animate-spin text-primary" aria-hidden="true" />
            <span className="text-sm font-medium text-foreground">Analizando con IA…</span>
          </div>
          <p className="text-xs text-muted-foreground max-w-md">
            Estamos leyendo el panel de frecuencia cardíaca. Esto toma 3–8 segundos.
            Si la imagen es nítida, Claude Vision reconoce tu FC en reposo, el rango
            del día (mín–máx) y el promedio.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
