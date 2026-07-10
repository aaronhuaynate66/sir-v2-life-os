// SIR V2 — Cliente para captura de báscula.
// Dos funciones publicas:
//   - extractScaleCapture(blob): llama POST /api/capture/scale, retorna JSON
//   - persistScaleCapture({extracted, blob, ...}): sube imagen + inserta
//     N rows a health_metrics via store (bulk setState para 1 sola sync push)

'use client'

import { createClient } from '@/lib/supabase/client'
import { useSelfStore } from '@/stores/useSelfStore'
import { blobToBase64 } from './compress'
import { buildScaleHealthMetrics } from './map'
import { waitForRowsConfirmed } from './confirm'
import type { ScaleCaptureExtracted, ScaleMetric } from './types'

const STORAGE_BUCKET = 'scale-captures'

/** Cuántos de esos ids ya están confirmados en health_metrics (read-back). */
async function countConfirmedMetrics(
  supabase: ReturnType<typeof createClient>,
  ids: string[],
  userId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('health_metrics')
    .select('id')
    .eq('user_id', userId)
    .in('id', ids)
  if (error) return 0
  return (data ?? []).length
}

/**
 * Llama al endpoint /api/capture/scale con la imagen base64.
 * Retorna el JSON validado del Vision API.
 */
export async function extractScaleCapture(
  imageBlob: Blob,
  signal?: AbortSignal,
): Promise<ScaleCaptureExtracted> {
  const imageBase64 = await blobToBase64(imageBlob)
  const res = await fetch('/api/capture/scale', {
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
  return (await res.json()) as ScaleCaptureExtracted
}

export interface PersistArgs {
  /** Metricas editadas por el usuario (subset de las 13). Solo las que tienen valor numerico se persisten. */
  finalMetrics: Partial<Record<ScaleMetric, number>>
  /** Fecha de la medicion en ISO 8601 — viene del Step 3 (editable). */
  measuredAt: string
  /** Blob comprimido WebP para subir al Storage. */
  imageBlob: Blob
  /** Confidence del Vision para guardarla como nota (opcional debug). */
  confidence?: 'high' | 'medium' | 'low'
  /**
   * Si true, NO resuelve hasta confirmar (read-back) que los rows llegaron a
   * Supabase. Rompe levemente el offline-first (la UI bloquea ~1s hasta el ACK)
   * pero vale la pena en captura: las 13 métricas son irrecuperables si el push
   * falla en silencio y el usuario cree que se guardaron. Default false (flujo
   * anterior intacto — ej. el batch, que no debe colgarse por imagen).
   */
  awaitSync?: boolean
}

export interface PersistResult {
  captureId: string
  sourceImagePath: string
  insertedCount: number
  /**
   * Solo con `awaitSync`: true = confirmado en DB; false = quedó pendiente
   * (guardado local, se re-pushea al reconectar → la UI debe decir "guardado en
   * este dispositivo", NO error). undefined = no se verificó (sin awaitSync).
   */
  confirmed?: boolean
}

/**
 * Flujo confirm (Step 4):
 *   1. Genera captureId = `cap_${Date.now()}`
 *   2. Sube WebP a Storage en `{userId}/{captureId}.webp`
 *   3. Construye N HealthMetric (uno por metrica con valor numerico)
 *   4. setState bulk en useSelfStore → 1 diff cycle → 1 upsert batch
 *      (engine de sync ya levanta los rows al DB en background).
 */
export async function persistScaleCapture(args: PersistArgs): Promise<PersistResult> {
  const supabase = createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError) throw authError
  const userId = authData?.user?.id
  if (!userId) throw new Error('No hay sesión activa.')

  const captureId = `cap_${Date.now()}`
  const sourceImagePath = `${userId}/${captureId}.webp`

  // 1. Upload a Storage
  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(sourceImagePath, args.imageBlob, {
      contentType: 'image/webp',
      upsert: false,
    })
  if (uploadError) {
    throw new Error(`No se pudo subir la imagen: ${uploadError.message}`)
  }

  // 2. Construir HealthMetric[] (mapeo puro, testeado en map.test.ts)
  const metrics = buildScaleHealthMetrics({
    finalMetrics: args.finalMetrics,
    captureId,
    sourceImagePath,
    measuredAt: args.measuredAt,
    confidence: args.confidence,
  })
  if (metrics.length === 0) {
    // No hay métricas válidas — borrar la imagen subida para no dejar
    // basura, aunque RLS permite re-upload luego.
    await supabase.storage.from(STORAGE_BUCKET).remove([sourceImagePath]).catch(() => {})
    throw new Error('No hay métricas numéricas para guardar.')
  }

  // 3. Bulk setState: una sola mutacion del slice. El subscriber del sync
  // engine ve un cambio, hace diff (N upserts), y los manda en una sola
  // request a Supabase.
  useSelfStore.setState((s) => ({ healthMetrics: [...s.healthMetrics, ...metrics] }))

  // 4. Read-back verify (opt-in): esperar a que el sync engine confirme el push
  // en DB antes de que la UI cante "guardado". Sin awaitSync, retorna al toque
  // como antes (confirmed = undefined).
  let confirmed: boolean | undefined
  if (args.awaitSync) {
    const ids = metrics.map((m) => m.id)
    confirmed = await waitForRowsConfirmed(ids, (chunk) =>
      countConfirmedMetrics(supabase, chunk, userId),
    )
  }

  return { captureId, sourceImagePath, insertedCount: metrics.length, confirmed }
}
