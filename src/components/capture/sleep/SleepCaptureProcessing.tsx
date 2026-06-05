'use client'
// SIR V2 — Loading mientras Vision procesa el panel de sueño.

import { Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface SleepCaptureProcessingProps {
  /** URL local (createObjectURL) del blob comprimido para mostrar thumbnail. */
  previewUrl: string
}

export function SleepCaptureProcessing({ previewUrl }: SleepCaptureProcessingProps) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row items-center gap-6">
        {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL no es optimizable por next/image */}
        <img
          src={previewUrl}
          alt="Captura de sueño"
          className="w-32 h-32 object-cover rounded-md border border-border"
        />
        <div className="flex-1 flex flex-col items-center sm:items-start gap-2 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <Loader2 size={16} className="animate-spin text-primary" aria-hidden="true" />
            <span className="text-sm font-medium text-foreground">Analizando con IA…</span>
          </div>
          <p className="text-xs text-muted-foreground max-w-md">
            Estamos leyendo el panel de sueño. Esto toma 3–8 segundos. Si la imagen
            es nítida, Claude Vision reconoce la duración, el horario, las fases
            (profundo, liviano, REM) y la puntuación de calidad.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
