// SIR V2 — Cliente del flujo "importar Apple Health como archivo" (browser).
//
// Camino $0 (sin pagar la automatización REST API de Health Auto Export):
//   1. El usuario sube el .json (o .zip) del "Manual Export → JSON".
//   2. Lo parseamos en el cliente para un PREVIEW instantáneo (mismo parser puro
//      mapHealthAutoExport — no reescribimos nada) → N métricas / N noches / días.
//   3. Al confirmar, POSTeamos el payload crudo a /api/health/import (sesión-auth),
//      que vuelve a parsear y persiste con el MISMO mapeo y el MISMO upsert
//      idempotente por (user_id, external_id) que el webhook con token.
//   4. Las filas escritas se reflejan al instante en /yo mergeándolas al store.

'use client'

import { parseErrorResponse } from '@/lib/api/errors'
import { mapHealthAutoExport } from '@/lib/health/ingest/parse'
import type { HealthAutoExportPayload } from '@/lib/health/ingest/types'
import { healthMetricAdapter, sleepRecordAdapter } from '@/lib/supabase/sync'
import { useSelfStore } from '@/stores/useSelfStore'
import { extractJsonTextsFromZip } from './zipJson'
import { HaeImportError, mergeHaePayloads, parseHaeJson } from './payload'
import { summarizeMapping, type HaeImportSummary } from './summary'

const JSON_RE = /\.json$/i
const ZIP_RE = /\.zip$/i

/** ¿El archivo es candidato a import de Apple Health (.json o .zip)? */
export function isAppleHealthCandidate(file: File): boolean {
  return (
    JSON_RE.test(file.name) ||
    ZIP_RE.test(file.name) ||
    file.type === 'application/json' ||
    file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed'
  )
}

function isZip(file: File): boolean {
  return (
    ZIP_RE.test(file.name) ||
    file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed'
  )
}

/** Inflador deflate-raw del browser (mismo método que el unzip de WhatsApp). */
async function inflateRawClient(data: Uint8Array): Promise<Uint8Array> {
  const part = new Uint8Array(data)
  const ds = new DecompressionStream('deflate-raw')
  const stream = new Blob([part]).stream().pipeThrough(ds)
  const ab = await new Response(stream).arrayBuffer()
  return new Uint8Array(ab)
}

/**
 * Lee el archivo (json o zip) y devuelve UN HealthAutoExportPayload.
 *   - .json → texto directo.
 *   - .zip  → extrae todos los .json en el cliente (sin subir el zip) y los junta.
 * Lanza HaeImportError con mensaje claro si algo no cuadra.
 */
export async function readHaePayloadFromFile(file: File): Promise<HealthAutoExportPayload> {
  if (isZip(file)) {
    if (typeof DecompressionStream === 'undefined') {
      throw new HaeImportError(
        'Este navegador no puede descomprimir el .zip. Subí el .json directamente (Health Auto Export → Manual Export → JSON).',
      )
    }
    let texts: string[]
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      texts = await extractJsonTextsFromZip(bytes, inflateRawClient)
    } catch (e) {
      if (e instanceof HaeImportError) throw e
      throw new HaeImportError(e instanceof Error ? e.message : 'No pude leer el .zip.')
    }
    const payloads = texts.map(parseHaeJson)
    return payloads.length === 1 ? payloads[0] : mergeHaePayloads(payloads)
  }
  const text = await file.text()
  return parseHaeJson(text)
}

/** Resumen client-side para el preview (no toca el server). */
export function previewHae(payload: HealthAutoExportPayload): HaeImportSummary {
  return summarizeMapping(mapHealthAutoExport(payload))
}

export interface HaeImportResult {
  ok: boolean
  healthMetrics: number
  sleepRecords: number
  daysCovered: number
  skipped: string[]
}

interface ImportResponse {
  ok: boolean
  healthMetrics: number
  sleepRecords: number
  daysCovered: number
  skipped?: string[]
  healthRows?: Record<string, unknown>[]
  sleepRows?: Record<string, unknown>[]
}

/**
 * POSTea el payload al endpoint sesión-auth (persiste con upsert idempotente) y
 * refleja las filas escritas en el store para que /yo se actualice al instante.
 * La re-emisión del engine de sync (upsert onConflict:'id') es un no-op idempotente
 * y preserva source/external_id (toRow no los toca).
 */
export async function importAppleHealth(payload: HealthAutoExportPayload): Promise<HaeImportResult> {
  const res = await fetch('/api/health/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw await parseErrorResponse(res)
  const json = (await res.json()) as ImportResponse
  mergeRowsIntoStore(json.healthRows ?? [], json.sleepRows ?? [])
  return {
    ok: json.ok,
    healthMetrics: json.healthMetrics,
    sleepRecords: json.sleepRecords,
    daysCovered: json.daysCovered,
    skipped: json.skipped ?? [],
  }
}

function mergeRowsIntoStore(
  healthRows: Record<string, unknown>[],
  sleepRows: Record<string, unknown>[],
): void {
  if (healthRows.length > 0) {
    const incoming = healthRows.map((r) => healthMetricAdapter.fromRow(r))
    useSelfStore.setState((s) => ({ healthMetrics: mergeById(s.healthMetrics, incoming) }))
  }
  if (sleepRows.length > 0) {
    const incoming = sleepRows.map((r) => sleepRecordAdapter.fromRow(r))
    useSelfStore.setState((s) => ({ sleepRecords: mergeById(s.sleepRecords, incoming) }))
  }
}

/** Reemplaza por id (filas nuevas ganan); preserva la referencia de las no tocadas. */
function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const map = new Map(existing.map((x) => [x.id, x]))
  for (const item of incoming) map.set(item.id, item)
  return [...map.values()]
}

export { HaeImportError }
export type { HaeImportSummary }
