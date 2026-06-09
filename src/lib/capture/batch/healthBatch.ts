// SIR V2 — Procesar capturas de SALUD (sueño/FC/báscula) en LOTE (auto-guardar).
//
// El flujo single de cada tipo tiene un paso de revisión editable; en lote
// auto-guardamos confiando en la extracción (paneles = screenshots limpios) y
// mostramos el resultado por imagen para verificar. Cada panel trae su propia
// fecha → varias noches/mediciones no se pisan.
//
// Builders Extracted→Final PUROS (testeables); la orquestación (compress +
// extract + persist) tiene side-effects de store y vive abajo.

import { compressImage } from '@/lib/capture/scale/compress'
import { extractSleepPanel, persistSleepCapture, todayInLima } from '@/lib/capture/sleep/client'
import { extractHeartRatePanel, persistHeartRateCapture } from '@/lib/capture/hr/client'
import { extractScaleCapture, persistScaleCapture } from '@/lib/capture/scale/client'
import { resolveSleepDay } from '@/lib/capture/sleep/map'
import { resolveHrDay } from '@/lib/capture/hr/map'
import { resolveScaleMeasuredAt } from '@/lib/capture/scale/map'
import type { SleepPanelExtracted, SleepCaptureFinal } from '@/lib/capture/sleep/types'
import type { HeartRatePanelExtracted, HeartRateCaptureFinal } from '@/lib/capture/hr/types'
import type { CaptureType } from '@/lib/capture/observations/types'

export const HEALTH_BATCH_TYPES: ReadonlySet<CaptureType> = new Set([
  'scale',
  'sleep_panel',
  'heart_rate_panel',
])

/** Sueño: Extracted → Final. totalMinutes cae a la suma de fases si el panel no
 *  trae el total. PURO. */
export function sleepFinalFromExtracted(ex: SleepPanelExtracted, fallbackDay: string): SleepCaptureFinal {
  const s = ex.stages
  const stageSum = (s.deep_minutes ?? 0) + (s.light_minutes ?? 0) + (s.rem_minutes ?? 0)
  const totalMinutes = ex.total_minutes ?? stageSum
  return {
    day: resolveSleepDay(ex.date, fallbackDay),
    totalMinutes,
    bedtime: ex.bedtime,
    wakeTime: ex.wake_time,
    stages: ex.stages,
    score: ex.score,
    confidence: ex.confidence,
  }
}

/** FC: Extracted → Final. Copia directa + día resuelto. PURO. */
export function hrFinalFromExtracted(ex: HeartRatePanelExtracted, fallbackDay: string): HeartRateCaptureFinal {
  return {
    day: resolveHrDay(ex.date, fallbackDay),
    restingBpm: ex.resting_bpm,
    minBpm: ex.min_bpm,
    maxBpm: ex.max_bpm,
    avgBpm: ex.avg_bpm,
    highAlerts: ex.high_alerts,
    lowAlerts: ex.low_alerts,
    confidence: ex.confidence,
  }
}

/** Procesa y GUARDA una captura de salud. Devuelve un resumen legible para la
 *  UI del lote. Lanza si no se pudo leer lo mínimo. */
export async function processHealthCaptureInBatch(file: File, type: CaptureType): Promise<{ label: string }> {
  const compressed = await compressImage(file, { maxSize: 1280, quality: 0.9 })

  if (type === 'sleep_panel') {
    const ex = await extractSleepPanel(compressed.blob)
    const final = sleepFinalFromExtracted(ex, todayInLima())
    if (final.totalMinutes <= 0) throw new Error('No se pudo leer la duración del sueño')
    const r = persistSleepCapture(final)
    return { label: `Sueño ${r.day} · ${r.durationHours.toFixed(1)} h` }
  }

  if (type === 'heart_rate_panel') {
    const ex = await extractHeartRatePanel(compressed.blob)
    const final = hrFinalFromExtracted(ex, todayInLima())
    if (final.restingBpm == null && final.minBpm == null && final.maxBpm == null && final.avgBpm == null) {
      throw new Error('No se pudo leer ningún valor de FC')
    }
    persistHeartRateCapture(final)
    const v = final.restingBpm ?? final.avgBpm ?? final.maxBpm
    return { label: `FC ${final.day}${v != null ? ` · ${v} ppm` : ''}` }
  }

  if (type === 'scale') {
    const ex = await extractScaleCapture(compressed.blob)
    const metrics = ex.metrics ?? {}
    if (Object.keys(metrics).length === 0) throw new Error('No se leyó ninguna métrica de la báscula')
    const measuredAt = resolveScaleMeasuredAt(ex.measured_at)
    const r = await persistScaleCapture({ finalMetrics: metrics, measuredAt, imageBlob: compressed.blob, confidence: ex.confidence })
    const w = metrics.weight_kg
    return { label: `Báscula ${measuredAt.slice(0, 10)}${w != null ? ` · ${w} kg` : ''} (${r.insertedCount} métricas)` }
  }

  throw new Error('Tipo de salud no soportado en lote')
}
