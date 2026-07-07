import { describe, it, expect } from 'vitest'

import { buildCycleHorizon, phaseCareReading } from './horizon'

// Último período 2026-06-23, ciclo 28 días. Día 1 = 23-jun.
// menstrual 1-5 (23-27 jun) · folicular 6-12 (28jun-4jul) · ovulación 13-15 (5-7jul)
// · lútea 16-28 (8-20jul) · siguiente período 21-jul.
const BASE = {
  lastPeriodStart: '2026-06-23',
  cycleLengthDays: 28,
  bandDays: 4,
  horizonFrom: '2026-06-01',
  horizonTo: '2026-09-12',
}
const NOW = new Date('2026-07-07T12:00:00') // día 15, ovulación

describe('phaseCareReading', () => {
  it('PMS → cuidado, sin conversación pesada', () => {
    expect(phaseCareReading('luteal', true, false)).toMatch(/sensible|cuidar/i)
  })
  it('menstrual → plan suave', () => {
    expect(phaseCareReading('menstrual', false, false)).toMatch(/suave|íntimo|recogimiento/i)
  })
  it('fértil/ovulación → energía alta', () => {
    expect(phaseCareReading('ovulation', false, true)).toMatch(/alta|lindo|proponer/i)
  })
})

describe('buildCycleHorizon', () => {
  it('proyecta los inicios de período dentro del horizonte', () => {
    const h = buildCycleHorizon({ ...BASE, events: [] }, NOW)!
    expect(h).not.toBeNull()
    expect(h.projectedPeriods).toContain('2026-06-23') // el confirmado
    expect(h.projectedPeriods).toContain('2026-07-21') // +28 días
    expect(h.projectedPeriods).toContain('2026-08-18')
    expect(h.projectedPeriods.every((p) => p >= '2026-06-01' && p <= '2026-09-12')).toBe(true)
  })

  it('ubica un evento en su fase y le da lectura de cuidado', () => {
    // Mesario 13-jul → día 21 → lútea.
    const h = buildCycleHorizon({ ...BASE, events: [{ date: '2026-07-13', label: 'Mesario', kind: 'mesario' }] }, NOW)!
    const ev = h.events[0]
    expect(ev.cycleDay).toBe(21)
    expect(ev.phase).toBe('luteal')
    expect(ev.isFuture).toBe(true)
    expect(ev.reading).toMatch(/gesto|presencia/i)
  })

  it('marca incertidumbre creciente en el futuro y 0 en el pasado', () => {
    const h = buildCycleHorizon({
      ...BASE,
      events: [
        { date: '2026-06-25', label: 'pasado', kind: 'calendar' },   // pasado (real)
        { date: '2026-08-23', label: 'Cusco', kind: 'trip' },        // ~2 ciclos adelante
      ],
    }, NOW)!
    const pasado = h.events.find((e) => e.label === 'pasado')!
    const cusco = h.events.find((e) => e.label === 'Cusco')!
    expect(pasado.uncertainDays).toBe(0)
    expect(cusco.isFuture).toBe(true)
    expect(cusco.uncertainDays).toBeGreaterThan(BASE.bandDays) // acumula con la distancia
  })

  it('descarta eventos fuera del horizonte y ordena por fecha', () => {
    const h = buildCycleHorizon({
      ...BASE,
      events: [
        { date: '2026-07-23', label: 'cumple', kind: 'birthday' },
        { date: '2026-07-13', label: 'mesario', kind: 'mesario' },
        { date: '2027-01-01', label: 'fuera', kind: 'calendar' }, // fuera del horizonte
      ],
    }, NOW)!
    expect(h.events.map((e) => e.label)).toEqual(['mesario', 'cumple'])
  })

  it('sin período válido → null', () => {
    expect(buildCycleHorizon({ ...BASE, lastPeriodStart: 'no-fecha', events: [] }, NOW)).toBeNull()
  })
})
