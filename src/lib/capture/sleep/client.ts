// SIR V2 — Cliente para captura de panel de sueño.
// Dos funciones públicas:
//   - extractSleepPanel(blob): llama POST /api/capture/sleep, retorna el JSON.
//   - persistSleepCapture(final): construye el SleepRecord y lo guarda en el
//     store (upsert por día). NO sube la imagen a Storage (no hay bucket de
//     sueño; sleep_records no tiene source_image_path) y NO vincula persona:
//     es data propia (capa biológica), igual que la báscula.

'use client'

import { useSelfStore } from '@/stores/useSelfStore'
import { blobToBase64 } from '@/lib/capture/scale/compress'
import { buildSleepRecordFromPanel } from './map'
import type { SleepCaptureFinal, SleepPanelExtracted } from './types'

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
 * Llama al endpoint /api/capture/sleep con la imagen base64. Retorna el JSON
 * validado del Vision API.
 */
export async function extractSleepPanel(
  imageBlob: Blob,
  signal?: AbortSignal,
): Promise<SleepPanelExtracted> {
  const imageBase64 = await blobToBase64(imageBlob)
  const res = await fetch('/api/capture/sleep', {
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
  return (await res.json()) as SleepPanelExtracted
}

export interface PersistSleepResult {
  id: string
  day: string
  /** Duración en horas (lo que se guardó). */
  durationHours: number
  /** Calidad 1-10 derivada. */
  quality: number
  /** true si reemplazó un registro previo de la misma noche. */
  replaced: boolean
}

/**
 * Construye el SleepRecord (mapeo puro, testeado en map.test.ts) y lo escribe
 * en el store. Dedupe por día: si ya hay un registro con el mismo `id`
 * (= shot:sleep:YYYY-MM-DD), lo REEMPLAZA — una sola noche por día. El sync
 * engine sube el cambio con upsert onConflict:'id'.
 */
export function persistSleepCapture(final: SleepCaptureFinal): PersistSleepResult {
  const record = buildSleepRecordFromPanel(final)

  let replaced = false
  useSelfStore.setState((s) => {
    const rest = s.sleepRecords.filter((r) => {
      if (r.id === record.id) {
        replaced = true
        return false
      }
      return true
    })
    return { sleepRecords: [...rest, record] }
  })

  return {
    id: record.id,
    day: record.date,
    durationHours: record.duration,
    quality: record.quality,
    replaced,
  }
}
