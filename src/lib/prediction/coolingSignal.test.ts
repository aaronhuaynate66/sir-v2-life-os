import { describe, it, expect } from 'vitest'

import { assessCooling } from './coolingSignal'
import type { ConvMsg } from '@/lib/conversation-analytics/analyze'

const DAY = 86_400_000
const NOW = 1_800_000_000_000 // epoch fijo

// Intercambios limpios y ordenados: por cada uno, un mensaje MÍO y la respuesta
// de la OTRA persona `latMin` minutos después. Los intercambios van cada 3h
// (para que latMin ≤ 120 no reordene). `exchangesPerDay` intercambios/día.
function stream(startDaysAgo: number, endDaysAgo: number, exchangesPerDay: number, latMin = 5): ConvMsg[] {
  const out: ConvMsg[] = []
  for (let d = startDaysAgo; d > endDaysAgo; d--) {
    const dayStart = NOW - d * DAY
    for (let e = 0; e < exchangesPerDay; e++) {
      const myAt = dayStart + e * 3 * 3600_000
      out.push({ fromMe: true, at: myAt, text: 'x' })
      out.push({ fromMe: false, at: myAt + latMin * 60_000, text: 'x' })
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

describe('assessCooling', () => {
  it('data fina → insufficient', () => {
    expect(assessCooling([], NOW).status).toBe('insufficient')
    expect(assessCooling([{ fromMe: true, at: NOW - DAY, text: 'x' }], NOW).status).toBe('insufficient')
  })

  it('volumen y latencia estables → estable', () => {
    const msgs = [...stream(90, 30, 3, 5), ...stream(30, 0, 3, 5)]
    const r = assessCooling(msgs, NOW)
    expect(r.status).toBe('estable')
    expect(r.reasons).toEqual([])
  })

  it('volumen que se desploma → enfriándose', () => {
    const msgs = [...stream(90, 30, 6, 5), ...stream(30, 0, 1, 5)]
    const r = assessCooling(msgs, NOW)
    expect(r.status).toBe('enfriándose')
    expect(r.reasons.some((x) => x.includes('menos'))).toBe(true)
  })

  it('latencia que crece fuerte → enfriándose', () => {
    const msgs = [...stream(90, 30, 4, 5), ...stream(30, 0, 4, 120)]
    const r = assessCooling(msgs, NOW)
    expect(r.status).toBe('enfriándose')
    expect(r.reasons.some((x) => x.includes('responderte'))).toBe(true)
  })
})
