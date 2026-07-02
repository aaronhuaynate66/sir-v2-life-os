import { describe, it, expect } from 'vitest'
import { needsResummary } from './summaryHealth'
import type { Observation } from './types'

function makeObs(captureType: string, data: Record<string, unknown>): Observation {
  return {
    id: 'o1',
    userId: 'u',
    personId: 'p',
    captureType: captureType as Observation['captureType'],
    sourceImagePath: null,
    storageBucket: null,
    data,
    detectorData: null,
    userEdits: null,
    confidence: 'high',
    needsReview: false,
    observedAt: '2026-07-02T12:00:00Z',
    capturedAt: '2026-07-02T12:00:00Z',
    isObsolete: false,
    obsoletedAt: null,
    obsoletedReason: null,
    createdAt: '2026-07-02T12:00:00Z',
  }
}

const RAW = [{ ts: '2026-06-01T10:00:00Z', author: 'user', content: 'hola' }, { ts: '2026-06-01T10:01:00Z', author: 'other', content: 'buenas' }]

describe('needsResummary', () => {
  it('false para captureType != whatsapp_chat', () => {
    expect(needsResummary(makeObs('instagram', { summary: 'X', rawMessages: RAW }))).toBe(false)
  })

  it('false si NO hay rawMessages (no podemos reconstruir)', () => {
    expect(needsResummary(makeObs('whatsapp_chat', { summary: 'Conversación de WhatsApp con Fabiola.' }))).toBe(false)
    expect(needsResummary(makeObs('whatsapp_chat', { summary: 'Conversación de WhatsApp con Fabiola.', rawMessages: [] }))).toBe(false)
  })

  it('true si summary VACÍO y hay rawMessages', () => {
    expect(needsResummary(makeObs('whatsapp_chat', { rawMessages: RAW }))).toBe(true)
    expect(needsResummary(makeObs('whatsapp_chat', { summary: '', rawMessages: RAW }))).toBe(true)
    expect(needsResummary(makeObs('whatsapp_chat', { summary: '   ', rawMessages: RAW }))).toBe(true)
  })

  it('true si summary matcha "Conversación de WhatsApp con X."', () => {
    expect(needsResummary(makeObs('whatsapp_chat', { summary: 'Conversación de WhatsApp con Fabiola.', rawMessages: RAW }))).toBe(true)
    expect(needsResummary(makeObs('whatsapp_chat', { summary: 'Conversacion de WhatsApp con Fabiola.', rawMessages: RAW }))).toBe(true)
  })

  it('true si summary matcha "Importado del export"', () => {
    expect(needsResummary(makeObs('whatsapp_chat', { summary: 'Importado del export de WhatsApp · 43 mensajes', rawMessages: RAW }))).toBe(true)
  })

  it('true si summary es demasiado corto (< 40 chars)', () => {
    expect(needsResummary(makeObs('whatsapp_chat', { summary: 'Hablamos.', rawMessages: RAW }))).toBe(true)
  })

  it('FALSE si summary parece decente (≥40 chars, sin templates)', () => {
    expect(needsResummary(makeObs('whatsapp_chat', {
      summary: 'Hablamos del cierre del proyecto, quedó pendiente revisar el contrato. Ella se veía cansada.',
      rawMessages: RAW,
    }))).toBe(false)
  })
})
