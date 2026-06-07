// SIR V2 — Validación/normalización PURA del payload de Apple Health subido
// como archivo ("Health Auto Export" → Manual Export → JSON).
//
// No reescribe el parser (ese es mapHealthAutoExport en ingest/parse.ts): sólo
// se asegura de que lo que llega tenga la FORMA esperada antes de pasárselo, y
// junta varios payloads (caso de un .zip con varios .json) en uno solo. Errores
// claros y tipados (HaeImportError) para mostrarlos por-item sin romper el lote.

import type { HAEMetric, HealthAutoExportPayload } from '@/lib/health/ingest/types'

/** Error de importación con mensaje apto para mostrar al usuario. */
export class HaeImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HaeImportError'
  }
}

/**
 * ¿El valor tiene la forma de un export de Health Auto Export?
 * Acepta tanto `{ data: { metrics: [...] } }` (formato estándar) como
 * `{ metrics: [...] }` en la raíz (algunas automatizaciones). Type guard.
 */
export function looksLikeHae(value: unknown): value is HealthAutoExportPayload {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  const data = v.data as Record<string, unknown> | undefined
  const fromData = data && typeof data === 'object' ? data.metrics : undefined
  return Array.isArray(fromData) || Array.isArray(v.metrics)
}

/**
 * Parsea texto JSON a un payload de Health Auto Export, validando la forma.
 * Lanza HaeImportError (no JSON / forma inesperada) con mensaje claro.
 */
export function parseHaeJson(text: string): HealthAutoExportPayload {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new HaeImportError('El archivo no es un JSON válido.')
  }
  if (!looksLikeHae(parsed)) {
    throw new HaeImportError(
      'No reconozco este JSON como un export de Apple Health (Health Auto Export). Esperaba { data: { metrics: [...] } }.',
    )
  }
  return parsed
}

/**
 * Junta varios payloads (p. ej. múltiples .json dentro de un .zip) en uno solo,
 * concatenando sus arrays de métricas. El parser agrega por día, así que el
 * orden no importa. Devuelve siempre el formato canónico `{ data: { metrics } }`.
 */
export function mergeHaePayloads(payloads: HealthAutoExportPayload[]): HealthAutoExportPayload {
  const metrics: HAEMetric[] = []
  for (const p of payloads) {
    const fromData = p?.data?.metrics
    if (Array.isArray(fromData)) metrics.push(...fromData)
    else if (Array.isArray(p?.metrics)) metrics.push(...p.metrics)
  }
  return { data: { metrics } }
}
