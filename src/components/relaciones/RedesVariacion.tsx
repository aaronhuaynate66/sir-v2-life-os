'use client'
// SIR V2 — Variación de métricas de redes en el tiempo (seguidores/seguidos/
// posts) a partir del historial de capturas. Aaron: "quiero generar registros y
// ver las variaciones". Cada captura nueva = un punto; acá se ve la tendencia.

import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import { TrendChart } from '@/components/charts/TrendChart'
import {
  profileMetricSeries,
  lastDelta,
  type ProfileMetricPoint,
  type ProfileMetricField,
} from '@/lib/observations/profileMetrics'

const FIELDS: { key: ProfileMetricField; label: string }[] = [
  { key: 'followers', label: 'Seguidores' },
  { key: 'following', label: 'Seguidos' },
  { key: 'posts', label: 'Posts' },
]

export function RedesVariacion({ personId }: { personId: string }) {
  const [points, setPoints] = useState<ProfileMetricPoint[] | null>(null)
  const [field, setField] = useState<ProfileMetricField>('followers')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/observations/profile-history?person_id=${encodeURIComponent(personId)}&type=instagram`)
        if (!res.ok) return
        const data = (await res.json()) as { points?: ProfileMetricPoint[] }
        if (!cancelled && Array.isArray(data.points)) setPoints(data.points)
      } catch {
        /* best-effort */
      }
    })()
    return () => { cancelled = true }
  }, [personId])

  if (!points) return null
  const series = profileMetricSeries(points, field)
  // Sin 2+ capturas no hay variación que mostrar; avisamos cómo generarla.
  if (series.length < 2) {
    if (series.length === 0) return null
    return (
      <p className="mt-2 text-[11px] text-muted-foreground">
        Tenés 1 captura de Instagram. Subí otra más adelante (Agregar captura → Imagen) y acá vas a ver cómo varían seguidores, seguidos y posts.
      </p>
    )
  }
  const delta = lastDelta(series)
  const deltaLabel = delta === null ? '' : delta > 0 ? `+${delta}` : `${delta}`

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-1.5">
        {FIELDS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setField(f.key)}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] ${field === f.key ? 'border-brand bg-brand text-brand-foreground' : 'border-border text-muted-foreground'}`}
          >
            {f.label}
          </button>
        ))}
        {delta !== null && delta !== 0 && (
          <span className={`ml-auto text-[11px] font-medium ${delta > 0 ? 'text-ok' : 'text-warn'}`}>
            {deltaLabel} desde la captura anterior
          </span>
        )}
      </div>
      <TrendChart
        label={`Variación · ${FIELDS.find((f) => f.key === field)!.label}`}
        icon={Users}
        points={series}
        formatValue={(n) => n.toLocaleString('es-PE')}
        emptyHint="Subí capturas en distintos momentos para ver la variación."
      />
    </div>
  )
}
