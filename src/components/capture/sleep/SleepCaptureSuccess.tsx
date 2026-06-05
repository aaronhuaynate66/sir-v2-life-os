'use client'
// SIR V2 — Confirmación final de captura de sueño.

import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface SleepCaptureSuccessProps {
  /** Día guardado ('YYYY-MM-DD'). */
  day: string
  durationHours: number
  quality: number
  /** Reemplazó un registro previo de la misma noche. */
  replaced: boolean
  onAnother: () => void
}

export function SleepCaptureSuccess({
  day,
  durationHours,
  quality,
  replaced,
  onAnother,
}: SleepCaptureSuccessProps) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-6 sm:p-8 flex flex-col items-center text-center gap-4">
        <div className="w-14 h-14 rounded-full bg-ok-soft border border-ok/30 flex items-center justify-center">
          <CheckCircle2 size={28} strokeWidth={1.75} className="text-ok" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">
            {replaced ? 'Noche actualizada' : 'Sueño guardado'}
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            <span className="font-mono tabular-nums">{day}</span> ·{' '}
            <span className="font-mono tabular-nums">{durationHours}h</span> · calidad{' '}
            <span className="font-mono tabular-nums">{quality}/10</span>.{' '}
            {replaced && 'Reemplazó el registro previo de esa noche. '}
            Lo vas a ver en <span className="font-medium text-foreground">/yo</span> en cuanto
            sincronice.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-center pt-2">
          <Button size="sm" variant="outline" onClick={onAnother}>
            Otra captura
          </Button>
          <Button size="sm" asChild>
            <Link href="/yo">Ver en Self</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
