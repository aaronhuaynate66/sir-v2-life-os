// SIR V2 — Tests del validator/sanitizer de WhatsApp (chat).
//
// Estos guards son la única barrera entre el JSON crudo de Claude Vision y
// la persistencia: si dejan pasar basura, se escribe basura. Cubrimos el
// happy path, cada rechazo, y la normalización del sanitize.

import { describe, it, expect } from 'vitest'

import type { WhatsAppCaptureExtracted } from './types'
import { isValidWhatsAppCaptureExtracted, sanitizeExtracted } from './validate'

const valid = (over: Partial<WhatsAppCaptureExtracted> = {}): WhatsAppCaptureExtracted => ({
  personName: 'Diana',
  conversationDate: '2026-05-30T12:00:00.000Z',
  summary: 'Charla sobre el viaje',
  topics: ['travel', 'plans'],
  emotionalStates: { otherPerson: 'excited', user: 'calm' },
  rawMessages: [
    { timestamp: '14:03', author: 'other', content: 'hola' },
    { timestamp: '14:04', author: 'user', content: 'todo bien?' },
  ],
  confidence: 'high',
  ...over,
})

describe('isValidWhatsAppCaptureExtracted — acepta', () => {
  it('objeto completo válido', () => {
    expect(isValidWhatsAppCaptureExtracted(valid())).toBe(true)
  })

  it('conversationDate null', () => {
    expect(isValidWhatsAppCaptureExtracted(valid({ conversationDate: null }))).toBe(true)
  })

  it('rawMessages vacío y emotionalStates vacío', () => {
    expect(
      isValidWhatsAppCaptureExtracted(valid({ rawMessages: [], emotionalStates: {} })),
    ).toBe(true)
  })

  it('reflectionQuestions presente (Nivel C)', () => {
    expect(
      isValidWhatsAppCaptureExtracted(valid({ reflectionQuestions: ['¿por qué?'] })),
    ).toBe(true)
  })
})

describe('isValidWhatsAppCaptureExtracted — rechaza', () => {
  it('no-objeto / null', () => {
    expect(isValidWhatsAppCaptureExtracted(null)).toBe(false)
    expect(isValidWhatsAppCaptureExtracted('x')).toBe(false)
    expect(isValidWhatsAppCaptureExtracted(42)).toBe(false)
  })

  it('personName ausente o no-string', () => {
    expect(isValidWhatsAppCaptureExtracted({ ...valid(), personName: undefined })).toBe(false)
    expect(isValidWhatsAppCaptureExtracted({ ...valid(), personName: 123 })).toBe(false)
  })

  it('conversationDate string pero no ISO parseable', () => {
    expect(isValidWhatsAppCaptureExtracted(valid({ conversationDate: 'ayer' }))).toBe(false)
  })

  it('topics no es array de strings', () => {
    expect(isValidWhatsAppCaptureExtracted({ ...valid(), topics: 'travel' })).toBe(false)
    expect(isValidWhatsAppCaptureExtracted({ ...valid(), topics: [1, 2] })).toBe(false)
  })

  it('mensaje con timestamp mal formado', () => {
    expect(
      isValidWhatsAppCaptureExtracted(
        valid({ rawMessages: [{ timestamp: '2pm', author: 'user', content: 'h' }] }),
      ),
    ).toBe(false)
  })

  it('mensaje con author inválido o content no-string', () => {
    expect(
      isValidWhatsAppCaptureExtracted(
        valid({ rawMessages: [{ timestamp: '14:00', author: 'bot' as never, content: 'h' }] }),
      ),
    ).toBe(false)
    expect(
      isValidWhatsAppCaptureExtracted(
        valid({ rawMessages: [{ timestamp: '14:00', author: 'user', content: 5 as never }] }),
      ),
    ).toBe(false)
  })

  it('confidence fuera del enum', () => {
    expect(isValidWhatsAppCaptureExtracted({ ...valid(), confidence: 'altísima' })).toBe(false)
  })

  it('rawObservations / reflectionQuestions con tipo incorrecto', () => {
    expect(isValidWhatsAppCaptureExtracted({ ...valid(), rawObservations: 7 })).toBe(false)
    expect(isValidWhatsAppCaptureExtracted({ ...valid(), reflectionQuestions: [1] })).toBe(false)
  })
})

describe('sanitizeExtracted', () => {
  it('trimea personName y summary', () => {
    const out = sanitizeExtracted(valid({ personName: '  Diana  ', summary: '  hola  ' }))
    expect(out.personName).toBe('Diana')
    expect(out.summary).toBe('hola')
  })

  it('summary se capa a 320 chars', () => {
    const out = sanitizeExtracted(valid({ summary: 'a'.repeat(500) }))
    expect(out.summary).toHaveLength(320)
  })

  it('topics: trim, filtra vacíos, capa a 10', () => {
    const out = sanitizeExtracted(
      valid({ topics: ['  a ', '', '   ', 'b', ...Array(20).fill('x')] }),
    )
    expect(out.topics).toHaveLength(10)
    expect(out.topics[0]).toBe('a')
    expect(out.topics[1]).toBe('b')
    expect(out.topics).not.toContain('')
  })

  it('emotionalStates undefined -> {otherPerson: undefined, user: undefined}', () => {
    const raw = valid()
    // forzamos ausencia
    ;(raw as { emotionalStates?: unknown }).emotionalStates = undefined
    const out = sanitizeExtracted(raw)
    expect(out.emotionalStates).toEqual({ otherPerson: undefined, user: undefined })
  })

  it('reflectionQuestions: trim, filtra vacíos, capa a 3', () => {
    const out = sanitizeExtracted(
      valid({ reflectionQuestions: [' q1 ', '', 'q2', 'q3', 'q4'] }),
    )
    expect(out.reflectionQuestions).toEqual(['q1', 'q2', 'q3'])
  })

  it('rawObservations: capa a 240 y trim; vacío -> undefined', () => {
    const out = sanitizeExtracted(valid({ rawObservations: '  ' + 'z'.repeat(300) }))
    expect(out.rawObservations!.length).toBeLessThanOrEqual(240)
    const empty = sanitizeExtracted(valid({ rawObservations: '    ' }))
    expect(empty.rawObservations).toBeUndefined()
  })
})
