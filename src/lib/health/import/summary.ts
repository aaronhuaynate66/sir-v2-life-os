// SIR V2 — Resumen PURO de una importación de Apple Health.
//
// Toma el resultado normalizado del parser (mapHealthAutoExport, reusado tal
// cual) y produce un resumen legible para el preview "antes/después de guardar"
// del panel "Mis capturas": cuántas métricas, cuántas noches de sueño, cuántos
// días cubre y qué nombres de Apple no supimos mapear. Sin I/O, determinístico.

import type { IngestMapResult } from '@/lib/health/ingest/types'

export interface HaeImportSummary {
  /** Filas de health_metrics que entrarían (peso/FC/actividad/…). */
  healthMetrics: number
  /** Noches de sueño que entrarían. */
  sleepRecords: number
  /** Días distintos cubiertos (unión de días de métricas + noches). */
  daysCovered: number
  /** Días distintos, ordenados ('YYYY-MM-DD'). */
  days: string[]
  /** Nombres de métricas presentes pero no mapeadas (diagnóstico). */
  skipped: string[]
}

/** Resume el resultado del parser. PURO. */
export function summarizeMapping(mapped: IngestMapResult): HaeImportSummary {
  const days = new Set<string>()
  for (const m of mapped.healthMetrics) days.add(m.day)
  for (const s of mapped.sleepRecords) days.add(s.date)
  const sorted = [...days].sort()
  return {
    healthMetrics: mapped.healthMetrics.length,
    sleepRecords: mapped.sleepRecords.length,
    daysCovered: sorted.length,
    days: sorted,
    skipped: mapped.skipped,
  }
}
