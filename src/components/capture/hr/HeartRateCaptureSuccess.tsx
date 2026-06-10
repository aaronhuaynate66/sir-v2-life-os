'use client'
// SIR V2 — Confirmación final de captura de FC.

import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface HeartRateCaptureSuccessProps {
  /** Día guardado ('YYYY-MM-DD'). */
  day: string
  /** FC en reposo guardada (la verdad), o null si no se capturó. */
  restingBpm: number | null
  /** Filas insertadas (reposo / min / max / promedio). */
  insertedCount: number
  /** Reemplazó filas previas del mismo día. */
  replaced: boolean
  onAnother: () => void
}

export function HeartRateCaptureSuccess({
  day,
  restingBpm,
  insertedCount,
  replaced,
  onAnother,
}: HeartRateCaptureSuccessProps) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-6 sm:p-8 flex flex-col items-center text-center gap-4">
        <div className="w-14 h-14 rounded-full bg-ok-soft border border-ok/30 flex items-center justify-center">
          <CheckCircle2 size={28} strokeWidth={1.75} className="text-ok" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">
            {replaced ? 'FC actualizada' : 'FC guardada'}
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            <span className="font-mono tabular-nums">{day}</span> ·{' '}
            {restingBpm !== null ? (
              <>
                reposo{' '}
                <span className="font-mono tabular-nums text-foreground font-medium">
                  {restingBpm}
                </span>{' '}
                lpm ·{' '}
              </>
            ) : null}
            <span className="font-mono tabular-nums">{insertedCount}</span>{' '}
            {insertedCount === 1 ? 'registro' : 'registros'}.{' '}
            {replaced && 'Reemplazó los registros previos de ese día. '}
            Tu FC de reposo pasa a ser tu FC actual en{' '}
            <span className="font-medium text-foreground">/yo</span> en cuanto sincronice.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-center pt-2">
          <Button size="sm" variant="outline" onClick={onAnother}>
            Otra captura
          </Button>
          <Button size="sm" asChild>
            <Link href="/salud">Ver en Salud</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
