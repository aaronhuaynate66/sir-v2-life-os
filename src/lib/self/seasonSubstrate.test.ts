import { describe, it, expect } from 'vitest'

import { summarizeSeasonSubstrate, type SeasonSubstrateInput } from './seasonSubstrate'

const EMPTY: SeasonSubstrateInput = { metrics: [], sleep: [], memories: [] }

// Ventana de la estación: junio 2026.
const START = '2026-06-01'
const END = '2026-06-30'

describe('summarizeSeasonSubstrate', () => {
  it('sin sustrato → hasSubstrate false, line null', () => {
    const v = summarizeSeasonSubstrate(START, END, EMPTY)
    expect(v.hasSubstrate).toBe(false)
    expect(v.line).toBeNull()
    expect(v.moodAvg).toBeNull()
    expect(v.sleepHoursAvg).toBeNull()
  })

  it('promedia ánimo/energía SOLO dentro de la ventana', () => {
    const v = summarizeSeasonSubstrate(START, END, {
      ...EMPTY,
      metrics: [
        { category: 'mood', value: 6, timestamp: '2026-06-05T10:00:00Z' },
        { category: 'mood', value: 8, timestamp: '2026-06-20T10:00:00Z' },
        { category: 'mood', value: 2, timestamp: '2026-05-15T10:00:00Z' }, // fuera → ignorar
        { category: 'energy', value: 7, timestamp: '2026-06-10T10:00:00Z' },
        { category: 'stress', value: 9, timestamp: '2026-06-10T10:00:00Z' }, // no es mood/energy
      ],
    })
    expect(v.moodAvg).toBe(7) // (6+8)/2
    expect(v.energyAvg).toBe(7)
    expect(v.line).toMatch(/ánimo 7\/10/i)
  })

  it('promedia horas de sueño y las redondea a 1 decimal', () => {
    const v = summarizeSeasonSubstrate(START, END, {
      ...EMPTY,
      sleep: [
        { date: '2026-06-02', duration: 6, quality: 8 },
        { date: '2026-06-03', duration: 7.5, quality: 9 },
        { date: '2026-07-01', duration: 4, quality: 5 }, // fuera → ignorar
      ],
    })
    expect(v.sleepHoursAvg).toBe(6.8) // (6+7.5)/2 = 6.75 → 6.8
    expect(v.line).toMatch(/Dormiste 6\.8h/)
  })

  it('cuenta momentos reales (episódicos/emocionales, importantes, no privados) y toma el top', () => {
    const v = summarizeSeasonSubstrate(START, END, {
      ...EMPTY,
      memories: [
        { type: 'episodic', timestamp: '2026-06-05T00:00:00Z', importance: 9, title: 'Mudanza a casa de Marita' },
        { type: 'emotional', timestamp: '2026-06-12T00:00:00Z', importance: 7, title: 'Volví a entrenar' },
        { type: 'episodic', timestamp: '2026-06-12T00:00:00Z', importance: 4, title: 'Compré café' }, // < 7 → no
        { type: 'emotional', timestamp: '2026-06-12T00:00:00Z', importance: 10, title: 'privada', isPrivate: true }, // privada → no
        { type: 'semantic', timestamp: '2026-06-08T00:00:00Z', importance: 10, title: 'Nueva persona registrada: Alex' }, // NO es momento (registro de sistema)
        { type: 'episodic', timestamp: '2026-05-01T00:00:00Z', importance: 9, title: 'Antes de la ventana' }, // fuera
      ],
    })
    expect(v.markedMoments).toBe(2)
    expect(v.topMoment).toBe('Mudanza a casa de Marita')
    // Los momentos NO se cuentan en la línea (se inflan con imports); van por topMoment.
    expect(v.line).toBeNull()
    expect(v.hasSubstrate).toBe(true)
  })

  it('cuenta una memoria marcada a mano aunque su importancia sea baja', () => {
    const v = summarizeSeasonSubstrate(START, END, {
      ...EMPTY,
      memories: [{ type: 'episodic', timestamp: '2026-06-10T00:00:00Z', importance: 3, title: 'Nota mía', source: 'manual' }],
    })
    expect(v.markedMoments).toBe(1)
  })

  it('la línea solo incluye las partes con datos', () => {
    const v = summarizeSeasonSubstrate(START, END, {
      ...EMPTY,
      sleep: [{ date: '2026-06-02', duration: 8, quality: 9 }],
    })
    expect(v.line).toBe('Dormiste 8h.')
    expect(v.moodAvg).toBeNull()
  })

  it('incluye los bordes de la ventana (inclusive)', () => {
    const v = summarizeSeasonSubstrate(START, END, {
      ...EMPTY,
      metrics: [
        { category: 'mood', value: 5, timestamp: '2026-06-01T00:00:00Z' }, // borde inicio
        { category: 'mood', value: 5, timestamp: '2026-06-30T23:00:00Z' }, // borde fin
      ],
    })
    expect(v.moodAvg).toBe(5)
  })

  it('con solo momentos (sin métricas): line null pero hasSubstrate true y topMoment presente', () => {
    const v = summarizeSeasonSubstrate(START, END, {
      ...EMPTY,
      memories: [{ type: 'episodic', timestamp: '2026-06-05T00:00:00Z', importance: 8, title: 'Hito' }],
    })
    expect(v.line).toBeNull()
    expect(v.hasSubstrate).toBe(true)
    expect(v.topMoment).toBe('Hito')
  })
})
