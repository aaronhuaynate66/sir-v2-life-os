'use client'
// SIR V2 — Step 4: confirmacion final con CTAs.

import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface ScaleCaptureSuccessProps {
  insertedCount: number
  onAnother: () => void
}

export function ScaleCaptureSuccess({ insertedCount, onAnother }: ScaleCaptureSuccessProps) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-6 sm:p-8 flex flex-col items-center text-center gap-4">
        <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
          <CheckCircle2 size={28} strokeWidth={1.75} className="text-emerald-400" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">
            {insertedCount} {insertedCount === 1 ? 'métrica guardada' : 'métricas guardadas'}
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            La imagen quedó archivada en tu bucket privado. Las métricas
            aparecerán en <span className="font-medium text-foreground">/timeline</span> en cuanto
            sincronicen con Supabase.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-center pt-2">
          <Button size="sm" variant="outline" onClick={onAnother}>
            Otra captura
          </Button>
          <Button size="sm" asChild>
            <Link href="/timeline">Ver en historial</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
