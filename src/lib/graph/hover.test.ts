import { describe, it, expect } from 'vitest'

import { ageFromBirthDate, relativeEs, buildHover, hoverToHtml } from './hover'
import type { Person } from '@/types'

const NOW = new Date('2026-06-01T12:00:00Z')

function person(over: Partial<Person> & Pick<Person, 'relationship'>): Person {
  return {
    id: 'p1',
    name: 'Diana Carolina',
    category: 'close',
    importanceScore: 5,
    energyImpact: 'neutral',
    trustLevel: 5,
    contactFrequency: '',
    tags: [],
    notes: '',
    ...over,
  } as Person
}

describe('ageFromBirthDate', () => {
  it('calcula la edad; ajusta si aún no fue el cumple este año', () => {
    expect(ageFromBirthDate('1995-01-10', NOW)).toBe(31) // cumple ya pasó
    expect(ageFromBirthDate('1995-12-31', NOW)).toBe(30) // cumple aún no
  })
  it('inválido / sin año real → null', () => {
    expect(ageFromBirthDate(undefined, NOW)).toBeNull()
    expect(ageFromBirthDate('no-fecha', NOW)).toBeNull()
  })
})

describe('relativeEs', () => {
  it('formatea recencia compacta', () => {
    expect(relativeEs('2026-06-01T11:59:30Z', NOW)).toBe('recién')
    expect(relativeEs('2026-05-29', NOW)).toBe('hace 3d')
    expect(relativeEs('2026-05-31', NOW)).toBe('ayer')
  })
})

describe('buildHover', () => {
  it('arma última interacción + ánimo + recomendación', () => {
    const h = buildHover({
      person: person({ relationship: 'romantic' }),
      interaction: { at: '2026-05-29', label: 'WhatsApp', mood: 'Ánimo 4/5' },
      recommendation: 'Mandale un mensaje, hace rato no hablan',
      now: NOW,
    })
    expect(h.lastInteraction).toBe('WhatsApp · hace 3d')
    expect(h.mood).toBe('Ánimo 4/5')
    expect(h.recommendation).toContain('Mandale un mensaje')
  })

  it('edad + fase de ciclo desde la persona', () => {
    const h = buildHover({
      person: person({ relationship: 'romantic', birthDate: '1995-01-10', cycleStartDate: '2026-05-28', cycleLengthDays: 28 }),
      now: NOW,
    })
    expect(h.age).toBe(31)
    expect(h.cycle).toMatch(/día \d+/)
  })

  it('recomendación larga se trunca', () => {
    const long = 'x'.repeat(200)
    const h = buildHover({ person: person({ relationship: 'friend' }), recommendation: long, now: NOW })
    expect(h.recommendation!.endsWith('…')).toBe(true)
    expect(h.recommendation!.length).toBeLessThanOrEqual(91)
  })

  it('siempre incluye relationLabel como fallback', () => {
    const h = buildHover({ person: person({ relationship: 'romantic' }), now: NOW })
    expect(h.relationLabel).toBe('Pareja')
  })
})

describe('hoverToHtml', () => {
  it('incluye los datos y escapa el texto del usuario', () => {
    const html = hoverToHtml('Diana <b>', { lastInteraction: 'WhatsApp · hace 3d', age: 31 })
    expect(html).toContain('Diana &lt;b&gt;') // escapado
    expect(html).toContain('WhatsApp · hace 3d')
    expect(html).toContain('31 años')
  })

  it('sin datos accionables → muestra fallback', () => {
    const html = hoverToHtml('Pedro', { relationLabel: 'Conocido/a' })
    expect(html).toContain('Conocido/a')
  })

  it('totalmente vacío → "Sin interacciones registradas"', () => {
    const html = hoverToHtml('Pedro', {})
    expect(html).toContain('Sin interacciones registradas')
  })
})
