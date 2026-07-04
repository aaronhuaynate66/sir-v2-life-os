// SIR V2 — Tests de salud del vínculo (15·3 + 15·6).

import { describe, it, expect } from 'vitest'
import { assessLinkHealth, relationshipMode, type InteractionPoint } from './health'

const NOW = new Date('2026-07-01T12:00:00Z')
function ints(specs: [number, number][]): InteractionPoint[] {
  // [quality, daysAgo]
  return specs.map(([q, d]) => ({ quality: q, at: new Date(NOW.getTime() - d * 86_400_000).toISOString() }))
}

describe('relationshipMode', () => {
  it('afectivo para family/friend/romantic; profesional para el resto', () => {
    expect(relationshipMode('romantic')).toBe('affective')
    expect(relationshipMode('family')).toBe('affective')
    expect(relationshipMode('friend')).toBe('affective')
    expect(relationshipMode('professional')).toBe('professional')
    expect(relationshipMode('mentor')).toBe('professional')
    expect(relationshipMode('acquaintance')).toBe('professional')
  })
})

describe('assessLinkHealth — tendencia de tono', () => {
  it('detecta enfriamiento (mitad reciente peor que la vieja)', () => {
    const r = assessLinkHealth({
      relationship: 'romantic', category: 'inner_circle',
      interactions: ints([[5, 40], [5, 35], [2, 8], [2, 3]]),
    }, NOW)
    expect(r.toneTrend).toBe('cooling')
    expect(r.attention).toBe(true)
  })

  it('detecta calidez (mitad reciente mejor)', () => {
    const r = assessLinkHealth({
      relationship: 'friend', category: 'close',
      interactions: ints([[2, 40], [3, 30], [5, 10], [5, 4]]),
    }, NOW)
    expect(r.toneTrend).toBe('warming')
    expect(r.guidance).toMatch(/cálido|presente/i)
  })

  it('insuficiente con menos de 4 interacciones', () => {
    const r = assessLinkHealth({
      relationship: 'friend', category: 'close',
      interactions: ints([[5, 10], [4, 3]]),
    }, NOW)
    expect(r.toneTrend).toBe('insufficient')
  })
})

describe('assessLinkHealth — cadencia relativa a la capa', () => {
  it('un íntimo pasado de cadencia amerita atención', () => {
    const r = assessLinkHealth({
      relationship: 'romantic', category: 'inner_circle',
      lastContactAt: new Date(NOW.getTime() - 30 * 86_400_000).toISOString(), // 30d > 12*1.5
      interactions: [],
    }, NOW)
    expect(r.cadence).toBe('overdue')
    expect(r.attention).toBe(true)
  })

  it('un peripheral con contacto raro es NORMAL, no alerta', () => {
    const r = assessLinkHealth({
      relationship: 'acquaintance', category: 'peripheral',
      lastContactAt: new Date(NOW.getTime() - 100 * 86_400_000).toISOString(), // <180
      interactions: [],
    }, NOW)
    expect(r.cadence).toBe('ok')
    expect(r.attention).toBe(false)
    expect(r.guidance).toBeNull()
  })
})

describe('assessLinkHealth — vocabulario ramificado (15·6)', () => {
  it('afectivo: presencia, sin lenguaje de gestión', () => {
    const r = assessLinkHealth({
      relationship: 'romantic', category: 'inner_circle', personName: 'Diana Díaz',
      lastContactAt: new Date(NOW.getTime() - 30 * 86_400_000).toISOString(),
      interactions: [],
    }, NOW)
    expect(r.mode).toBe('affective')
    expect(r.guidance).toMatch(/presencia|sin nada que resolver|sin motivo/i)
    expect(r.guidance).not.toMatch(/estrat|gestion|valor concreto|red tibia/i)
  })

  it('profesional: valor/reciprocidad, estrategia sin culpa', () => {
    const r = assessLinkHealth({
      relationship: 'professional', category: 'network', personName: 'Alex Heilbrunn',
      lastContactAt: new Date(NOW.getTime() - 200 * 86_400_000).toISOString(), // 200 > 90*1.5
      interactions: [],
    }, NOW)
    expect(r.mode).toBe('professional')
    // network no es capa cercana → atención solo por tono; acá cadence overdue pero
    // capa lejana ⇒ sin atención. Verificamos que NO fuerza afecto.
    expect(r.guidance === null || /valor|red/i.test(r.guidance)).toBe(true)
  })
})
