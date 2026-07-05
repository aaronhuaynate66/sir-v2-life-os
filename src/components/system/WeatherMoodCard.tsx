'use client'

// SIR V2 — Card 18·M2: clima → energía. Invisible por defecto: solo aparece
// cuando el motor detecta una racha gris que COINCIDE con un bajón real de tu
// energía (señal, no ruido). Nota honesta: contexto, no causa.
import { useEffect, useState } from 'react'
import { CloudDrizzle } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'

interface Signal {
  state: 'gray_streak' | 'mixed' | 'insufficient'
  note: string | null
}

export function WeatherMoodCard() {
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/external/weather-mood')
        if (!res.ok) return
        const data = (await res.json()) as { signal?: Signal }
        if (!cancelled && data.signal?.note) setNote(data.signal.note)
      } catch {
        /* best-effort: si falla, la card simplemente no aparece */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!note) return null

  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2">
          <CloudDrizzle size={16} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Clima y tu energía</div>
        </div>
        <p className="text-sm text-foreground/90 leading-relaxed">{note}</p>
      </CardContent>
    </Card>
  )
}
