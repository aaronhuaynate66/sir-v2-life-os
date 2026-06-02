import { describe, it, expect } from 'vitest'

import { assessExtraction, meaningfulFieldCount } from './legibility'

describe('meaningfulFieldCount', () => {
  it('cuenta solo campos con texto sustantivo; ignora flags/meta', () => {
    expect(meaningfulFieldCount({ headline: 'Ing. Industrial', currentCompany: 'Acme', isVerified: true, confidence: 'high' })).toBe(2)
    expect(meaningfulFieldCount({ handle: 'a', isPrivate: false })).toBe(0) // 'a' < 2 chars
    expect(meaningfulFieldCount({ topics: ['marketing', 'ventas'] })).toBe(1)
    expect(meaningfulFieldCount({ latestExperience: { title: 'CEO', name: 'X' } })).toBe(1)
    expect(meaningfulFieldCount({})).toBe(0)
  })
})

describe('assessExtraction', () => {
  it('confianza baja → unreadable (sin importar campos)', () => {
    expect(assessExtraction({ headline: 'Algo', company: 'Otra' }, 'low')).toBe('unreadable')
  })
  it('cero campos con sustancia → unreadable', () => {
    expect(assessExtraction({ confidence: 'high', isVerified: true }, 'high')).toBe('unreadable')
  })
  it('confianza media → review', () => {
    expect(assessExtraction({ headline: 'Ing.', currentCompany: 'Acme' }, 'medium')).toBe('review')
  })
  it('confianza desconocida (null) → review', () => {
    expect(assessExtraction({ headline: 'Ing.', currentCompany: 'Acme' }, null)).toBe('review')
  })
  it('alta confianza pero 1 solo campo → review (dudoso)', () => {
    expect(assessExtraction({ headline: 'Ing.' }, 'high')).toBe('review')
  })
  it('alta confianza + varios campos → ok', () => {
    expect(assessExtraction({ headline: 'Ing. Industrial', currentCompany: 'Acme', location: 'Lima' }, 'high')).toBe('ok')
  })
})
