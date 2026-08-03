import { describe, it, expect } from 'vitest'
import {
  normalizeStatus, normalizeSurface, normalizeFeedback, normalizeOutcome,
  isResolvedStatus, rowToSuggestion,
} from './types'

describe('normalizadores', () => {
  it('status válido / inválido', () => {
    expect(normalizeStatus('done')).toBe('done')
    expect(normalizeStatus('pending')).toBe('pending')
    expect(normalizeStatus('nope')).toBeNull()
    expect(normalizeStatus(123)).toBeNull()
  })
  it('surface cae a chat si es inválido', () => {
    expect(normalizeSurface('momentos')).toBe('momentos')
    expect(normalizeSurface('otro')).toBe('chat')
    expect(normalizeSurface(undefined)).toBe('chat')
  })
  it('feedback solo up/down', () => {
    expect(normalizeFeedback('up')).toBe('up')
    expect(normalizeFeedback('down')).toBe('down')
    expect(normalizeFeedback('meh')).toBeNull()
  })
  it('outcome válido', () => {
    expect(normalizeOutcome('worked')).toBe('worked')
    expect(normalizeOutcome('x')).toBeNull()
    // 'ignored' TIENE que sobrevivir: si el normalizador no lo lista, el valor llega
    // a la base y el lector lo convierte en null en silencio. Casi pasó el 3-ago.
    expect(normalizeOutcome('ignored')).toBe('ignored')
    expect(normalizeOutcome('didnt')).toBe('didnt')
    expect(normalizeOutcome('unknown')).toBe('unknown')
  })
  it('isResolvedStatus', () => {
    expect(isResolvedStatus('done')).toBe(true)
    expect(isResolvedStatus('dismissed')).toBe(true)
    expect(isResolvedStatus('accepted')).toBe(true)
    expect(isResolvedStatus('pending')).toBe(false)
  })
})

describe('rowToSuggestion', () => {
  it('mapea una fila cruda tolerando faltantes', () => {
    const s = rowToSuggestion({ id: 'sug_1', surface: 'chat', kind: 'crear_objetivo', title: 'X', status: 'pending', feedback: null, outcome: null, created_at: '2026-07-21T10:00:00Z', resolved_at: null })
    expect(s).toEqual({ id: 'sug_1', surface: 'chat', kind: 'crear_objetivo', title: 'X', status: 'pending', feedback: null, outcome: null, createdAt: '2026-07-21T10:00:00Z', resolvedAt: null })
  })
  it('defaults seguros si vienen basura', () => {
    const s = rowToSuggestion({ id: 'sug_2', surface: 'raro', status: 'raro' })
    expect(s.surface).toBe('chat')
    expect(s.status).toBe('pending')
    expect(s.kind).toBe('answer')
  })
})
