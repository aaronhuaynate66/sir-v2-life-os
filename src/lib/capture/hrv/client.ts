// SIR V2 — Cliente para captura de panel de VFC/HRV. Espeja hr/client.ts.
'use client'

import { useSelfStore } from '@/stores/useSelfStore'
import { blobToBase64 } from '@/lib/capture/scale/compress'
import { buildHrvHealthMetrics, hrvDedupeBaseId } from './map'
import type { HrvCaptureFinal, HrvPanelExtracted } from './types'

const LIMA_TZ = 'America/Lima'
export function todayInLima(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: LIMA_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

export async function extractHrvPanel(imageBlob: Blob, signal?: AbortSignal): Promise<HrvPanelExtracted> {
  const imageBase64 = await blobToBase64(imageBlob)
  const res = await fetch('/api/capture/hrv', {
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
  return (await res.json()) as HrvPanelExtracted
}

export interface PersistHrvResult {
  day: string
  insertedCount: number
  replaced: boolean
}

export function persistHrvCapture(final: HrvCaptureFinal): PersistHrvResult {
  const rows = buildHrvHealthMetrics(final)
  if (rows.length === 0) {
    throw new Error('No hay valores de VFC para guardar.')
  }
  const prefix = `${hrvDedupeBaseId(final.day)}:`
  let replaced = false
  useSelfStore.setState((s) => {
    const rest = s.healthMetrics.filter((m) => {
      if (m.id.startsWith(prefix)) { replaced = true; return false }
      return true
    })
    return { healthMetrics: [...rest, ...rows] }
  })
  return { day: final.day, insertedCount: rows.length, replaced }
}
