// SIR V2 — Cliente para captura de panel de frecuencia cardíaca.
// Dos funciones públicas:
//   - extractHeartRatePanel(blob): llama POST /api/capture/hr, retorna el JSON.
//   - persistHeartRateCapture(final): construye los HealthMetric y los guarda en
//     el store (upsert por día). NO sube la imagen a Storage (no hay bucket de
//     FC; health_metrics.source_image_path queda null) y NO vincula persona:
//     es data propia (capa biológica), igual que la báscula y el sueño.

'use client'

import { useSelfStore } from '@/stores/useSelfStore'
import { blobToBase64 } from '@/lib/capture/scale/compress'
import { buildHeartRateHealthMetrics, hrDedupeBaseId } from './map'
import type { HeartRateCaptureFinal, HeartRatePanelExtracted } from './types'

const LIMA_TZ = 'America/Lima'

/** 'YYYY-MM-DD' de HOY en TZ Lima (fallback de fecha cuando el panel no la trae). */
export function todayInLima(now: Date = new Date()): string {
  // en-CA formatea como 'YYYY-MM-DD'; el timeZone garantiza el día correcto.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: LIMA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/**
 * Llama al endpoint /api/capture/hr con la imagen base64. Retorna el JSON
 * validado del Vision API.
 */
export async function extractHeartRatePanel(
  imageBlob: Blob,
  signal?: AbortSignal,
): Promise<HeartRatePanelExtracted> {
  const imageBase64 = await blobToBase64(imageBlob)
  const res = await fetch('/api/capture/hr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mimeType: imageBlob.type || 'image/webp' }),
    signal,
  })
  if (!res.ok) {
    let detail: string | undefined
    try {
      const body = (await res.json()) as { error?: string; detail?: string }
      detail = body.error ?? body.detail
    } catch {
      detail = `HTTP ${res.status}`
    }
    throw new Error(detail ?? `Falló la extracción (${res.status})`)
  }
  return (await res.json()) as HeartRatePanelExtracted
}

export interface PersistHeartRateResult {
  day: string
  /** FC en reposo guardada (la verdad), o null si no se capturó. */
  restingBpm: number | null
  /** Filas insertadas (reposo / min / max / promedio según presencia). */
  insertedCount: number
  /** true si reemplazó filas previas del mismo día. */
  replaced: boolean
}

/**
 * Construye los HealthMetric (mapeo puro, testeado en map.test.ts) y los escribe
 * en el store. Dedupe por día: reemplaza TODAS las filas previas con id que
 * empiece con `shot:hr:YYYY-MM-DD:` — re-capturar el mismo día reemplaza, no
 * duplica. El sync engine sube el cambio con upsert onConflict:'id'.
 */
export function persistHeartRateCapture(final: HeartRateCaptureFinal): PersistHeartRateResult {
  const rows = buildHeartRateHealthMetrics(final)
  if (rows.length === 0) {
    throw new Error('No hay valores de FC para guardar.')
  }

  const prefix = `${hrDedupeBaseId(final.day)}:`
  let replaced = false
  useSelfStore.setState((s) => {
    const rest = s.healthMetrics.filter((m) => {
      if (m.id.startsWith(prefix)) {
        replaced = true
        return false
      }
      return true
    })
    return { healthMetrics: [...rest, ...rows] }
  })

  const resting = rows.find((r) => r.type === 'heart_rate')
  return {
    day: final.day,
    restingBpm: resting ? resting.value : null,
    insertedCount: rows.length,
    replaced,
  }
}
