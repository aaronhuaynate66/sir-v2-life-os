// SIR V2 — Tests del validator/sanitizer de WhatsApp WEB.
//
// Reusa la validación de whatsapp_chat y agrega `phoneNumber` (string|null).
// Verificamos que delegue bien y que el teléfono se valide/sanitice aparte.

import { describe, it, expect } from 'vitest'

import type { WhatsAppWebExtracted } from './types'
import { isValidWhatsAppWebExtracted, sanitizeWhatsAppWeb } from './validate'

const valid = (over: Partial<WhatsAppWebExtracted> = {}): WhatsAppWebExtracted => ({
  personName: 'Maria Isabel',
  conversationDate: null,
  summary: 'conversación',
  topics: ['work'],
  emotionalStates: {},
  rawMessages: [{ timestamp: '09:15', author: 'other', content: 'buenas' }],
  confidence: 'medium',
  phoneNumber: '+51 992 794 483',
  ...over,
})

describe('isValidWhatsAppWebExtracted', () => {
  it('acepta phoneNumber string, null o ausente', () => {
    expect(isValidWhatsAppWebExtracted(valid())).toBe(true)
    expect(isValidWhatsAppWebExtracted(valid({ phoneNumber: null }))).toBe(true)
    const noPhone = valid()
    delete (noPhone as { phoneNumber?: unknown }).phoneNumber
    expect(isValidWhatsAppWebExtracted(noPhone)).toBe(true)
  })

  it('rechaza phoneNumber con tipo no-string', () => {
    expect(isValidWhatsAppWebExtracted({ ...valid(), phoneNumber: 51992794483 })).toBe(false)
  })

  it('rechaza si la base de conversación es inválida (delegación)', () => {
    expect(isValidWhatsAppWebExtracted({ ...valid(), confidence: 'x' })).toBe(false)
    expect(isValidWhatsAppWebExtracted({ ...valid(), personName: 9 })).toBe(false)
  })
})

describe('sanitizeWhatsAppWeb', () => {
  it('trimea y capa el teléfono a 40 chars', () => {
    expect(sanitizeWhatsAppWeb(valid({ phoneNumber: '  +51 992 794 483  ' })).phoneNumber).toBe(
      '+51 992 794 483',
    )
    expect(sanitizeWhatsAppWeb(valid({ phoneNumber: '9'.repeat(60) })).phoneNumber).toHaveLength(40)
  })

  it('teléfono vacío/whitespace/null -> null', () => {
    expect(sanitizeWhatsAppWeb(valid({ phoneNumber: '   ' })).phoneNumber).toBeNull()
    expect(sanitizeWhatsAppWeb(valid({ phoneNumber: null })).phoneNumber).toBeNull()
  })

  it('preserva la sanitización de la base (trim de personName)', () => {
    const out = sanitizeWhatsAppWeb(valid({ personName: '  Maria  ' }))
    expect(out.personName).toBe('Maria')
  })
})
