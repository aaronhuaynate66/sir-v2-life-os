// SIR V2 — Tests del resumen de importación de Apple Health.
//
// summarizeMapping se ejerce contra el RESULTADO del parser real (no mocks):
// así verificamos el preview de punta a punta sobre un payload representativo.

import { describe, it, expect } from 'vitest'

import { mapHealthAutoExport } from '@/lib/health/ingest/parse'
import type { HealthAutoExportPayload } from '@/lib/health/ingest/types'
import { summarizeMapping } from './summary'

const PAYLOAD: HealthAutoExportPayload = {
  data: {
    metrics: [
      {
        name: 'weight_body_mass',
        units: 'kg',
        data: [
          { date: '2026-06-01 07:00:00 -0500', qty: 80 },
          { date: '2026-06-02 07:00:00 -0500', qty: 79.6 },
        ],
      },
      {
        name: 'resting_heart_rate',
        units: 'count/min',
        data: [{ date: '2026-06-02 06:00:00 -0500', qty: 54 }],
      },
      {
        name: 'sleep_analysis',
        data: [
          {
            sleepStart: '2026-06-01 23:30:00 -0500',
            sleepEnd: '2026-06-02 07:00:00 -0500',
            totalSleep: 7.2,
          },
        ],
      },
      // Nombre desconocido → debe caer en skipped.
      { name: 'height', units: 'm', data: [{ date: '2026-06-02 07:00:00 -0500', qty: 1.75 }] },
    ],
  },
}

describe('summarizeMapping', () => {
  it('cuenta métricas, noches y días cubiertos del resultado del parser', () => {
    const summary = summarizeMapping(mapHealthAutoExport(PAYLOAD))
    // weight (2 días) + resting_heart_rate (1) = 3 filas de health_metrics.
    expect(summary.healthMetrics).toBe(3)
    expect(summary.sleepRecords).toBe(1)
    // Días: 2026-06-01 (peso), 2026-06-02 (peso/FC/sueño) → 2 días.
    expect(summary.daysCovered).toBe(2)
    expect(summary.days).toEqual(['2026-06-01', '2026-06-02'])
  })

  it('reporta los nombres no mapeados en skipped', () => {
    const summary = summarizeMapping(mapHealthAutoExport(PAYLOAD))
    expect(summary.skipped).toContain('height')
  })

  it('resume un mapeo vacío como ceros', () => {
    const summary = summarizeMapping(mapHealthAutoExport({ data: { metrics: [] } }))
    expect(summary).toMatchObject({ healthMetrics: 0, sleepRecords: 0, daysCovered: 0, days: [], skipped: [] })
  })
})
