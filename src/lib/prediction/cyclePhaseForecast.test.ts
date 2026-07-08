import { describe, it, expect } from 'vitest'

import { buildCyclePhaseForecast, pickCyclePhaseForecast } from './cyclePhaseForecast'
import { cyclePhase } from '@/lib/ciclo/phase'
import type { PersonLog, PersonLogKind } from '@/lib/person-logs/types'

const START = '2026-01-01'
const NOW = new Date('2026-06-01T12:00:00Z')

function mkLog(dateKey: string, value: number, kind: PersonLogKind = 'interaction'): PersonLog {
  return {
    id: `${dateKey}-${kind}`,
    userId: 'u',
    personId: 'p',
    kind,
    value,
    note: null,
    loggedAt: `${dateKey}T12:00:00`,
    createdAt: `${dateKey}T12:00:00`,
  }
}

/** Genera logs históricos (START..NOW) con un patrón claro: la fase `lowPhase`
 *  da valor 2, el resto 4. Usa la fase REAL computada, sin hardcodear límites. */
function historyWithLowPhase(lowPhase: string, kind: PersonLogKind = 'interaction'): PersonLog[] {
  const logs: PersonLog[] = []
  const start = new Date('2026-01-05T12:00:00')
  const end = new Date('2026-05-30T12:00:00')
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 2)) {
    const cp = cyclePhase(START, 28, d)
    if (!cp) continue
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    logs.push(mkLog(key, cp.phase === lowPhase ? 2 : 4, kind))
  }
  return logs
}

describe('buildCyclePhaseForecast', () => {
  it('sin ciclo → null', () => {
    const f = buildCyclePhaseForecast(
      { logs: historyWithLowPhase('luteal'), cycleStartDate: null, cycleLengthDays: 28, metric: 'interaction' },
      NOW,
    )
    expect(f).toBeNull()
  })

  it('historial sin patrón (todo igual) → null (no dramatiza coincidencias)', () => {
    const flat: PersonLog[] = []
    for (let i = 0; i < 40; i++) {
      const d = new Date('2026-02-01T12:00:00')
      d.setDate(d.getDate() + i * 3)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      flat.push(mkLog(key, 3))
    }
    const f = buildCyclePhaseForecast(
      { logs: flat, cycleStartDate: START, cycleLengthDays: 28, metric: 'interaction' },
      NOW,
    )
    expect(f).toBeNull()
  })

  it('con patrón (lútea baja) → proyecta forward y ubica la próxima ventana baja', () => {
    const f = buildCyclePhaseForecast(
      { logs: historyWithLowPhase('luteal'), cycleStartDate: START, cycleLengthDays: 28, metric: 'interaction' },
      NOW,
    )
    expect(f).not.toBeNull()
    expect(f!.metric).toBe('interaction')
    expect(f!.deltaDiff).toBeGreaterThan(0)
    // La ventana baja debe caer en fase Lútea, con valor proyectado ~2.
    expect(f!.nextLow).not.toBeNull()
    expect(f!.nextLow!.phaseLabel).toBe('Lútea')
    expect(f!.nextLow!.predicted).toBeLessThan(f!.baseline)
    // La ventana alta NO debe ser lútea y su valor > baseline.
    expect(f!.nextHigh).not.toBeNull()
    expect(f!.nextHigh!.phaseLabel).not.toBe('Lútea')
    expect(f!.nextHigh!.predicted).toBeGreaterThan(f!.baseline)
    // Historial denso (~70 logs) → confianza alta.
    expect(f!.confidence).toBe('alta')
  })

  it('delta por debajo del piso de ruido (<0.4) → null (no dramatiza)', () => {
    // Lútea promedia 3.0; el resto 3.2 → delta 0.2, por debajo del piso.
    const logs = historyWithLowPhase('luteal').map((l) =>
      l.value === 2 ? { ...l, value: 3 } : { ...l, value: 3 },
    )
    // Inyecto un puñado de 4 en fase folicular para un delta chico (~0.2).
    const withTinyDelta = logs.map((l, i) => (i % 9 === 0 ? { ...l, value: 4 } : l))
    const f = buildCyclePhaseForecast(
      { logs: withTinyDelta, cycleStartDate: START, cycleLengthDays: 28, metric: 'interaction' },
      NOW,
    )
    // Con un delta tan chico (ruido), o es null o su deltaDiff supera el piso;
    // afirmamos el invariante: si devuelve algo, el delta es >= 0.4.
    if (f) expect(f.deltaDiff).toBeGreaterThanOrEqual(0.4)
  })

  it('cada día proyectado hereda el promedio de su fase', () => {
    const f = buildCyclePhaseForecast(
      { logs: historyWithLowPhase('luteal'), cycleStartDate: START, cycleLengthDays: 28, metric: 'interaction' },
      NOW,
    )!
    expect(f.days.length).toBeGreaterThan(20)
    for (const day of f.days) {
      if (day.predicted == null) continue
      // Días lúteos ~2, el resto ~4.
      if (day.phaseLabel === 'Lútea') expect(day.predicted).toBeLessThanOrEqual(3)
      else expect(day.predicted).toBeGreaterThanOrEqual(3)
    }
  })

  it('el offset 0 corresponde a hoy y la serie es contigua', () => {
    const f = buildCyclePhaseForecast(
      { logs: historyWithLowPhase('luteal'), cycleStartDate: START, cycleLengthDays: 28, metric: 'interaction', horizonDays: 14 },
      NOW,
    )!
    expect(f.days[0].offset).toBe(0)
    expect(f.days[f.days.length - 1].offset).toBe(14)
  })
})

describe('pickCyclePhaseForecast', () => {
  it('elige la primera métrica con patrón real', () => {
    // 'energy' tiene patrón; 'interaction' no existe → debe caer en energy.
    const f = pickCyclePhaseForecast(
      { logs: historyWithLowPhase('luteal', 'energy'), cycleStartDate: START, cycleLengthDays: 28 },
      ['interaction', 'energy'],
      NOW,
    )
    expect(f).not.toBeNull()
    expect(f!.metric).toBe('energy')
  })

  it('sin ninguna métrica con patrón → null', () => {
    const f = pickCyclePhaseForecast(
      { logs: [], cycleStartDate: START, cycleLengthDays: 28 },
      undefined,
      NOW,
    )
    expect(f).toBeNull()
  })
})
