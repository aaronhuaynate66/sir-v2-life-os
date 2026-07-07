import { describe, it, expect } from 'vitest'
import { analyzeSleepSelfLink, type SleepPoint, type SelfPoint } from './crossSignal'

const BASE = Date.parse('2026-06-01T00:00:00Z')
const DAY = 86_400_000
const day = (i: number) => new Date(BASE + i * DAY).toISOString().slice(0, 10)

describe('analyzeSleepSelfLink (C1 cruzado N-de-1)', () => {
  it('insuficiente con pocos pares', () => {
    const sleep: SleepPoint[] = [0, 1, 2].map((i) => ({ day: day(i), score: 70 }))
    const energy: SelfPoint[] = [1, 2, 3].map((i) => ({ day: day(i), value: 6 }))
    const r = analyzeSleepSelfLink(sleep, energy, [])
    expect(r.links).toHaveLength(0)
    expect(r.insufficient.some((s) => s.includes('energy'))).toBe(true)
  })

  it('detecta un vínculo positivo fuerte sueño(noche)→energía(día sig)', () => {
    // energía del día i+1 = proporcional al sueño de la noche i
    const sleep: SleepPoint[] = []
    const energy: SelfPoint[] = []
    for (let i = 0; i < 10; i++) {
      const score = 40 + i * 6 // 40..94
      sleep.push({ day: day(i), score })
      energy.push({ day: day(i + 1), value: Math.round(score / 12) }) // sigue al sueño
    }
    const r = analyzeSleepSelfLink(sleep, energy, [])
    expect(r.links.length).toBeGreaterThanOrEqual(1)
    const link = r.links.find((l) => l.target === 'energy')!
    expect(link.direction).toBe('sube')
    expect(link.r).toBeGreaterThan(0.5)
    expect(link.pairs).toBe(10)
  })

  it('vínculo inverso → direction baja', () => {
    const sleep: SleepPoint[] = []
    const mood: SelfPoint[] = []
    for (let i = 0; i < 10; i++) {
      const score = 40 + i * 6
      sleep.push({ day: day(i), score })
      mood.push({ day: day(i + 1), value: 10 - Math.round(score / 12) }) // inverso
    }
    const r = analyzeSleepSelfLink(sleep, [], mood)
    const link = r.links.find((l) => l.target === 'mood')
    expect(link?.direction).toBe('baja')
  })

  it('esconde vínculos débiles sin muchos pares (ruido)', () => {
    // relación ~nula → r bajo → se esconde (débil con pocos pares)
    const sleep: SleepPoint[] = []
    const energy: SelfPoint[] = []
    const noise = [5, 3, 8, 2, 7, 4, 6, 3]
    for (let i = 0; i < 8; i++) {
      sleep.push({ day: day(i), score: 70 })
      energy.push({ day: day(i + 1), value: noise[i] })
    }
    const r = analyzeSleepSelfLink(sleep, energy, [])
    // sueño constante → sin variación → sin link
    expect(r.links.find((l) => l.target === 'energy')).toBeUndefined()
  })
})
