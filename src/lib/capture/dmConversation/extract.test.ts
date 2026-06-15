import { describe, it, expect } from 'vitest'
import { isValidDmExtracted, sanitizeDmExtracted } from './extract'

describe('dm extractor tolerante', () => {
  it('isValid acepta cualquier objeto (no 422)', () => {
    expect(isValidDmExtracted({})).toBe(true)
    expect(isValidDmExtracted({ summary: 'x' })).toBe(true)
    expect(isValidDmExtracted(null)).toBe(false)
    expect(isValidDmExtracted('x')).toBe(false)
  })
  it('coerce un DM parcial a shape válido', () => {
    const r = sanitizeDmExtracted({
      personName: 'Dayana', conversationDate: '2026-06-12',
      summary: 'Te saludó por tu cumpleaños; le pediste tus pastillas.',
      rawMessages: [{ author: 'other', content: 'Feliz cumpleaños!!! 🎉' }, { content: '' }, 'basura'],
    })
    expect(r.personName).toBe('Dayana')
    expect(r.conversationDate).toBe('2026-06-12')
    expect(r.summary).toContain('cumpleaños')
    expect(r.rawMessages.length).toBe(1)
    expect(r.confidence).toBe('low')
    expect(Array.isArray(r.topics)).toBe(true)
  })
  it('campos faltantes → defaults, fecha no-ISO → null', () => {
    const r = sanitizeDmExtracted({ conversationDate: 'el viernes' })
    expect(r.personName).toBe('')
    expect(r.summary).toBe('')
    expect(r.conversationDate).toBeNull()
    expect(r.rawMessages).toEqual([])
  })
})
