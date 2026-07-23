'use client'

// SIR V2 — "recordatorio de data faltante" (idea de Aaron: "que me diga falta el
// peso"). De la data que Aaron sube SIEMPRE (báscula, sueño, FC/VFC del día),
// detecta qué le faltó en su última subida y se lo recuerda — agrupado en bundles
// legibles, no 10 tipos crudos. Se auto-oculta cuando está al día. La lógica vive
// en @/lib/health/missingData (pura + testeada); acá solo adaptamos el store.

import { useMemo } from 'react'
import { ClipboardList } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { useSelfStore } from '@/stores/useSelfStore'
import { todayLimaKey, limaDayKey } from '@/lib/dates/limaDay'
import { computeMissingHealthData, SLEEP_TYPE, type Reading } from '@/lib/health/missingData'

/** "hoy" / "ayer" / "hace N días" entre dos YYYY-MM-DD. */
function agoLabel(day: string | null, today: string): string {
  if (!day) return 'sin registro'
  if (day === today) return 'hoy'
  const [ay, am, ad] = day.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  const diff = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
  if (diff === 1) return 'ayer'
  return `hace ${diff} días`
}

export function MissingDataCard() {
  const healthMetrics = useSelfStore((s) => s.healthMetrics)
  const sleepRecords = useSelfStore((s) => s.sleepRecords)

  const { missing, today } = useMemo(() => {
    const today = todayLimaKey()
    const readings: Reading[] = [
      ...healthMetrics
        .map((m) => ({ type: m.type as string, day: limaDayKey(m.timestamp) }))
        .filter((r): r is Reading => !!r.day),
      ...sleepRecords.map((r) => ({ type: SLEEP_TYPE, day: r.date })),
    ]
    return { missing: computeMissingHealthData(readings, today).missing, today }
  }, [healthMetrics, sleepRecords])

  if (missing.length === 0) return null

  return (
    <Card className="shadow-none mb-4 border-warn/30">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-2">
          <ClipboardList size={14} strokeWidth={1.75} className="text-warn" aria-hidden="true" />
          <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Te falta subir</h2>
        </div>
        <ul className="space-y-1.5">
          {missing.map((m) => (
            <li key={m.key} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{m.label}</span>
              <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">
                última vez: {agoLabel(m.lastSeen, today)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2.5 text-[12px] text-muted-foreground leading-relaxed">
          De lo que registras siempre, esto no está en tu última subida. Mándame la captura y la proceso.
        </p>
      </CardContent>
    </Card>
  )
}
