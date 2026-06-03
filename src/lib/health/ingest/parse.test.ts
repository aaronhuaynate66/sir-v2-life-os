// SIR V2 — Tests del parser de Health Auto Export.
//
// Cubren: parseo de fechas locales (sin shift UTC), extracción de valores,
// mapeo de nombres de Apple → tipos de SIR, agregación intradía (suma vs
// última lectura), claves de idempotencia (external_id), sueño (duración +
// calidad desde score o desde duración), y robustez ante basura.

import { describe, it, expect } from 'vitest'

import {
  mapHealthAutoExport,
  parseHAEDate,
  extractQty,
  qualityFromDuration,
  qualityFromScore,
} from './parse'
import type { HealthAutoExportPayload } from './types'

// ─── parseHAEDate ─────────────────────────────────────────────────────

describe('parseHAEDate', () => {
  it('parsea el formato local de Apple "YYYY-MM-DD HH:mm:ss -0500" preservando el día local', () => {
    const p = parseHAEDate('2026-06-02 06:34:00 -0500')
    expect(p).not.toBeNull()
    expect(p!.day).toBe('2026-06-02') // NO se corre a 2026-06-02T11:34Z → día 02
    expect(p!.hm).toBe('06:34')
    expect(p!.iso).toBe('2026-06-02T06:34:00-05:00')
  })

  it('acepta ISO con T y Z', () => {
    const p = parseHAEDate('2026-06-02T06:34:00Z')
    expect(p!.day).toBe('2026-06-02')
    expect(p!.iso).toBe('2026-06-02T06:34:00Z')
  })

  it('acepta offset con dos puntos', () => {
    expect(parseHAEDate('2026-06-02 23:00:00 -05:00')!.iso).toBe('2026-06-02T23:00:00-05:00')
  })

  it('acepta fecha sin segundos', () => {
    expect(parseHAEDate('2026-06-02 06:34 -0500')!.hm).toBe('06:34')
  })

  it('acepta fecha sólo-día', () => {
    const p = parseHAEDate('2026-06-02')
    expect(p!.day).toBe('2026-06-02')
    expect(p!.hm).toBe('00:00')
  })

  it('devuelve null ante basura', () => {
    expect(parseHAEDate('mañana')).toBeNull()
    expect(parseHAEDate(undefined)).toBeNull()
    expect(parseHAEDate(123)).toBeNull()
    expect(parseHAEDate('')).toBeNull()
  })
})

// ─── extractQty ───────────────────────────────────────────────────────

describe('extractQty', () => {
  it('prioriza qty, luego value, luego Avg', () => {
    expect(extractQty({ qty: 5 })).toBe(5)
    expect(extractQty({ value: '7.5' })).toBe(7.5)
    expect(extractQty({ Avg: 65, Min: 48, Max: 110 })).toBe(65)
  })
  it('devuelve null sin valor numérico', () => {
    expect(extractQty({})).toBeNull()
    expect(extractQty({ qty: NaN })).toBeNull()
    expect(extractQty({ value: 'x' })).toBeNull()
  })
})

// ─── qualidad de sueño ────────────────────────────────────────────────

describe('quality helpers', () => {
  it('qualityFromScore mapea 0-100 → 1-10 con clamp', () => {
    expect(qualityFromScore(85)).toBe(9)
    expect(qualityFromScore(48)).toBe(5)
    expect(qualityFromScore(0)).toBe(1)
    expect(qualityFromScore(100)).toBe(10)
  })
  it('qualityFromDuration es monótona en rangos', () => {
    expect(qualityFromDuration(8.5)).toBe(8)
    expect(qualityFromDuration(7)).toBe(7)
    expect(qualityFromDuration(4)).toBe(4)
    expect(qualityFromDuration(2)).toBe(3)
  })
})

// ─── mapHealthAutoExport: escalares ───────────────────────────────────

describe('mapHealthAutoExport — métricas escalares', () => {
  it('mapea resting_heart_rate → type heart_rate (fuente de verdad de FC)', () => {
    const r = mapHealthAutoExport({
      data: {
        metrics: [
          { name: 'resting_heart_rate', units: 'bpm', data: [{ date: '2026-06-02 07:00:00 -0500', qty: 48 }] },
        ],
      },
    })
    expect(r.healthMetrics).toHaveLength(1)
    const m = r.healthMetrics[0]
    expect(m.type).toBe('heart_rate')
    expect(m.value).toBe(48)
    expect(m.unit).toBe('lpm')
    expect(m.externalId).toBe('ah:resting_heart_rate:2026-06-02')
    expect(m.note).toContain('reposo')
  })

  it('mapea composición corporal: weight, body_fat, lean_body_mass, bmi', () => {
    const r = mapHealthAutoExport({
      data: {
        metrics: [
          { name: 'weight_body_mass', data: [{ date: '2026-06-02 07:00:00 -0500', qty: 89.3 }] },
          { name: 'body_fat_percentage', data: [{ date: '2026-06-02 07:00:00 -0500', qty: 24.9 }] },
          { name: 'lean_body_mass', data: [{ date: '2026-06-02 07:00:00 -0500', qty: 67.1 }] },
          { name: 'body_mass_index', data: [{ date: '2026-06-02 07:00:00 -0500', qty: 28.9 }] },
        ],
      },
    })
    const byType = Object.fromEntries(r.healthMetrics.map((m) => [m.type, m]))
    expect(byType.weight.value).toBe(89.3)
    expect(byType.body_fat_percent.value).toBe(24.9)
    expect(byType.muscle_mass_kg.value).toBe(67.1) // lean_body_mass → muscle_mass_kg
    expect(byType.bmi.value).toBe(28.9)
  })

  it('SUMA las métricas acumulativas del día (pasos, energía, distancia)', () => {
    const r = mapHealthAutoExport({
      data: {
        metrics: [
          {
            name: 'step_count',
            data: [
              { date: '2026-06-02 08:00:00 -0500', qty: 1000 },
              { date: '2026-06-02 12:00:00 -0500', qty: 1587 },
            ],
          },
        ],
      },
    })
    expect(r.healthMetrics).toHaveLength(1)
    expect(r.healthMetrics[0].type).toBe('steps')
    expect(r.healthMetrics[0].value).toBe(2587)
    // measured_at = el data point más reciente
    expect(r.healthMetrics[0].measuredAt).toBe('2026-06-02T12:00:00-05:00')
  })

  it('toma la ÚLTIMA lectura del día para métricas puntuales (peso)', () => {
    const r = mapHealthAutoExport({
      data: {
        metrics: [
          {
            name: 'weight_body_mass',
            data: [
              { date: '2026-06-02 07:00:00 -0500', qty: 90 },
              { date: '2026-06-02 21:00:00 -0500', qty: 89.3 },
            ],
          },
        ],
      },
    })
    expect(r.healthMetrics).toHaveLength(1)
    expect(r.healthMetrics[0].value).toBe(89.3) // la de las 21:00 gana
  })

  it('separa días distintos con external_id distinto (idempotencia por día)', () => {
    const r = mapHealthAutoExport({
      data: {
        metrics: [
          {
            name: 'step_count',
            data: [
              { date: '2026-06-01 10:00:00 -0500', qty: 500 },
              { date: '2026-06-02 10:00:00 -0500', qty: 700 },
            ],
          },
        ],
      },
    })
    const ids = r.healthMetrics.map((m) => m.externalId).sort()
    expect(ids).toEqual(['ah:step_count:2026-06-01', 'ah:step_count:2026-06-02'])
  })

  it('mapea métricas de actividad MEDIA: active/basal energy, vo2, spo2, distancia', () => {
    const r = mapHealthAutoExport({
      data: {
        metrics: [
          { name: 'active_energy', data: [{ date: '2026-06-02 23:00:00 -0500', qty: 140 }] },
          { name: 'basal_energy_burned', data: [{ date: '2026-06-02 23:00:00 -0500', qty: 1780 }] },
          { name: 'vo2_max', data: [{ date: '2026-06-02 10:00:00 -0500', qty: 42 }] },
          { name: 'blood_oxygen_saturation', data: [{ date: '2026-06-02 10:00:00 -0500', qty: 98 }] },
          { name: 'walking_running_distance', data: [{ date: '2026-06-02 10:00:00 -0500', qty: 1.8 }] },
        ],
      },
    })
    const byType = Object.fromEntries(r.healthMetrics.map((m) => [m.type, m.value]))
    expect(byType.active_energy).toBe(140)
    expect(byType.resting_energy).toBe(1780)
    expect(byType.vo2_max).toBe(42)
    expect(byType.blood_oxygen).toBe(98)
    expect(byType.distance_km).toBe(1.8)
  })

  it('reporta en `skipped` los nombres no mapeados (altura), pero NO heart_rate', () => {
    const r = mapHealthAutoExport({
      data: {
        metrics: [
          { name: 'height', data: [{ date: '2026-06-02 10:00:00 -0500', qty: 176 }] },
        ],
      },
    })
    expect(r.healthMetrics).toHaveLength(0)
    expect(r.skipped).toEqual(['height'])
  })

  it('es case-insensitive con el nombre de la métrica', () => {
    const r = mapHealthAutoExport({
      data: { metrics: [{ name: 'Step_Count', data: [{ date: '2026-06-02 10:00:00 -0500', qty: 10 }] }] },
    })
    expect(r.healthMetrics[0]?.type).toBe('steps')
  })
})

// ─── mapHealthAutoExport: frecuencia cardíaca ─────────────────────────

describe('mapHealthAutoExport — frecuencia cardíaca', () => {
  it('resting_heart_rate es la SEÑAL principal (type heart_rate, escalar diario)', () => {
    const r = mapHealthAutoExport({
      data: {
        metrics: [
          { name: 'resting_heart_rate', data: [{ date: '2026-06-02 07:00:00 -0500', qty: 48 }] },
        ],
      },
    })
    const hr = r.healthMetrics.filter((m) => m.type === 'heart_rate')
    expect(hr).toHaveLength(1)
    expect(hr[0].value).toBe(48)
    expect(hr[0].externalId).toBe('ah:resting_heart_rate:2026-06-02')
  })

  it('la FC GENERAL se guarda como rango (mín/máx/prom), NUNCA como escalar/reposo', () => {
    const r = mapHealthAutoExport({
      data: {
        metrics: [
          {
            name: 'heart_rate',
            units: 'bpm',
            data: [
              { date: '2026-06-02 08:00:00 -0500', Min: 44, Max: 90, Avg: 60 },
              { date: '2026-06-02 18:00:00 -0500', Min: 70, Max: 143, Avg: 100 },
            ],
          },
        ],
      },
    })
    const byType = Object.fromEntries(r.healthMetrics.map((m) => [m.type, m]))
    // mín = min de los Min; máx = max de los Max; prom = promedio de los Avg
    expect(byType.heart_rate_min.value).toBe(44)
    expect(byType.heart_rate_max.value).toBe(143)
    expect(byType.heart_rate_avg.value).toBe(80) // (60+100)/2
    // NUNCA produce un type 'heart_rate' (eso es sólo reposo)
    expect(r.healthMetrics.some((m) => m.type === 'heart_rate')).toBe(false)
    // claramente etiquetadas como rango
    expect(byType.heart_rate_min.note).toContain('Rango')
    expect(byType.heart_rate_max.externalId).toBe('ah:heart_rate_max:2026-06-02')
  })

  it('FC general con samples crudos (qty) deriva min=max=avg=qty por día', () => {
    const r = mapHealthAutoExport({
      data: {
        metrics: [
          {
            name: 'heart_rate',
            data: [
              { date: '2026-06-02 08:00:00 -0500', qty: 55 },
              { date: '2026-06-02 18:00:00 -0500', qty: 120 },
            ],
          },
        ],
      },
    })
    const byType = Object.fromEntries(r.healthMetrics.map((m) => [m.type, m.value]))
    expect(byType.heart_rate_min).toBe(55)
    expect(byType.heart_rate_max).toBe(120)
    expect(byType.heart_rate_avg).toBe(87.5) // (55+120)/2
  })

  it('resting y heart_rate general COEXISTEN sin pisarse', () => {
    const r = mapHealthAutoExport({
      data: {
        metrics: [
          { name: 'resting_heart_rate', data: [{ date: '2026-06-02 07:00:00 -0500', qty: 48 }] },
          { name: 'heart_rate', data: [{ date: '2026-06-02 18:00:00 -0500', Min: 50, Max: 143, Avg: 80 }] },
        ],
      },
    })
    const types = r.healthMetrics.map((m) => m.type).sort()
    expect(types).toEqual(['heart_rate', 'heart_rate_avg', 'heart_rate_max', 'heart_rate_min'])
    expect(r.healthMetrics.find((m) => m.type === 'heart_rate')!.value).toBe(48)
  })

  it('sleeping_heart_rate → métrica aparte (promedio del día)', () => {
    const r = mapHealthAutoExport({
      data: {
        metrics: [
          {
            name: 'sleeping_heart_rate',
            data: [
              { date: '2026-06-02 02:00:00 -0500', qty: 50 },
              { date: '2026-06-02 04:00:00 -0500', qty: 54 },
            ],
          },
        ],
      },
    })
    expect(r.healthMetrics).toHaveLength(1)
    expect(r.healthMetrics[0].type).toBe('sleeping_heart_rate')
    expect(r.healthMetrics[0].value).toBe(52) // promedio
    expect(r.healthMetrics[0].externalId).toBe('ah:sleeping_heart_rate:2026-06-02')
  })
})

// ─── mapHealthAutoExport: sueño ───────────────────────────────────────

describe('mapHealthAutoExport — sueño', () => {
  it('mapea sleep_analysis con totalSleep + sleepStart/End', () => {
    const r = mapHealthAutoExport({
      data: {
        metrics: [
          {
            name: 'sleep_analysis',
            data: [
              {
                date: '2026-06-02 06:34:00 -0500',
                sleepStart: '2026-06-01 22:00:00 -0500',
                sleepEnd: '2026-06-02 06:34:00 -0500',
                totalSleep: 8.57,
              },
            ],
          },
        ],
      },
    })
    expect(r.sleepRecords).toHaveLength(1)
    const s = r.sleepRecords[0]
    expect(s.date).toBe('2026-06-02') // día del despertar
    expect(s.bedtime).toBe('22:00')
    expect(s.wakeTime).toBe('06:34')
    expect(s.duration).toBe(8.57)
    expect(s.externalId).toBe('ah:sleep:2026-06-02')
    expect(s.quality).toBe(8) // derivada de la duración (sin score)
  })

  it('usa la puntuación de sueño (0-100) como calidad cuando está presente', () => {
    const r = mapHealthAutoExport({
      data: {
        metrics: [
          {
            name: 'sleep_analysis',
            data: [{ sleepStart: '2026-06-01 23:00:00 -0500', sleepEnd: '2026-06-02 05:00:00 -0500', asleep: 6 }],
          },
          { name: 'sleep_score', data: [{ date: '2026-06-02 06:00:00 -0500', qty: 92 }] },
        ],
      },
    })
    expect(r.sleepRecords[0].quality).toBe(9) // 92/10 → 9, no la heurística de 6h
    expect(r.sleepRecords[0].notes).toContain('92/100')
  })

  it('suma fragmentos de la misma noche y toma min(inicio)/max(fin)', () => {
    const r = mapHealthAutoExport({
      data: {
        metrics: [
          {
            name: 'sleep_analysis',
            data: [
              { sleepStart: '2026-06-01 22:00:00 -0500', sleepEnd: '2026-06-02 02:00:00 -0500', asleep: 4 },
              { sleepStart: '2026-06-02 02:30:00 -0500', sleepEnd: '2026-06-02 06:30:00 -0500', asleep: 4 },
            ],
          },
        ],
      },
    })
    expect(r.sleepRecords).toHaveLength(1)
    expect(r.sleepRecords[0].duration).toBe(8)
    expect(r.sleepRecords[0].bedtime).toBe('22:00')
    expect(r.sleepRecords[0].wakeTime).toBe('06:30')
  })

  it('deriva la duración de la suma de etapas cuando no hay total', () => {
    const r = mapHealthAutoExport({
      data: {
        metrics: [
          {
            name: 'sleep_analysis',
            data: [{ sleepEnd: '2026-06-02 06:00:00 -0500', deep: 1.2, core: 4.5, rem: 1.8, awake: 0.3 }],
          },
        ],
      },
    })
    expect(r.sleepRecords[0].duration).toBe(7.5) // 1.2+4.5+1.8, awake no cuenta
  })

  it('clampea la duración a 24h', () => {
    const r = mapHealthAutoExport({
      data: {
        metrics: [
          { name: 'sleep_analysis', data: [{ sleepEnd: '2026-06-02 06:00:00 -0500', asleep: 99 }] },
        ],
      },
    })
    expect(r.sleepRecords[0].duration).toBe(24)
  })

  it('ignora data points de sueño sin duración válida', () => {
    const r = mapHealthAutoExport({
      data: {
        metrics: [
          { name: 'sleep_analysis', data: [{ sleepEnd: '2026-06-02 06:00:00 -0500' }, { asleep: 0 }] },
        ],
      },
    })
    expect(r.sleepRecords).toHaveLength(0)
  })
})

// ─── Robustez ─────────────────────────────────────────────────────────

describe('mapHealthAutoExport — robustez', () => {
  it('payload vacío / sin métricas → resultado vacío', () => {
    expect(mapHealthAutoExport({})).toEqual({ healthMetrics: [], sleepRecords: [], skipped: [] })
    expect(mapHealthAutoExport({ data: {} }).healthMetrics).toHaveLength(0)
    expect(mapHealthAutoExport({ data: { metrics: [] } }).sleepRecords).toHaveLength(0)
  })

  it('acepta métricas en la raíz (no sólo en data.metrics)', () => {
    const r = mapHealthAutoExport({
      metrics: [{ name: 'step_count', data: [{ date: '2026-06-02 10:00:00 -0500', qty: 100 }] }],
    } as HealthAutoExportPayload)
    expect(r.healthMetrics[0]?.value).toBe(100)
  })

  it('ignora data points con fecha basura o sin valor', () => {
    const r = mapHealthAutoExport({
      data: {
        metrics: [
          {
            name: 'step_count',
            data: [
              { date: 'ayer', qty: 999 },
              { date: '2026-06-02 10:00:00 -0500' }, // sin qty
              { date: '2026-06-02 11:00:00 -0500', qty: 50 },
            ],
          },
        ],
      },
    })
    expect(r.healthMetrics).toHaveLength(1)
    expect(r.healthMetrics[0].value).toBe(50) // sólo el válido
  })

  it('no rompe con metric.name ausente', () => {
    const r = mapHealthAutoExport({ data: { metrics: [{ data: [{ qty: 1 }] }] } })
    expect(r.healthMetrics).toHaveLength(0)
    expect(r.skipped).toHaveLength(0)
  })

  it('redondea valores a 2 decimales', () => {
    const r = mapHealthAutoExport({
      data: { metrics: [{ name: 'weight_body_mass', data: [{ date: '2026-06-02 10:00:00 -0500', qty: 89.333333 }] }] },
    })
    expect(r.healthMetrics[0].value).toBe(89.33)
  })
})
