import { describe, it, expect } from 'vitest'
import {
  interactionLogMemoryId,
  shouldMaterializeInteraction,
  isSystemNote,
  toneToCharge,
  interactionLogToMemory,
  interactionLogToMemoryRow,
} from './fromInteractionLog'

describe('shouldMaterializeInteraction', () => {
  it('materializa interacción con nota real', () => {
    expect(shouldMaterializeInteraction('interaction', 'reunión dura hoy')).toBe(true)
  })
  it('NO materializa interacción sin nota', () => {
    expect(shouldMaterializeInteraction('interaction', null)).toBe(false)
    expect(shouldMaterializeInteraction('interaction', '   ')).toBe(false)
    expect(shouldMaterializeInteraction('interaction', '')).toBe(false)
  })
  it('NO materializa registros numéricos (mood/energy/sleep/pain)', () => {
    expect(shouldMaterializeInteraction('mood', 'me sentí mal')).toBe(false)
    expect(shouldMaterializeInteraction('sleep', 'dormí poco')).toBe(false)
  })
})

describe('interactionLogMemoryId', () => {
  it('es determinístico y prefijado', () => {
    expect(interactionLogMemoryId('log-123')).toBe('mem_log:log-123')
  })
})

describe('toneToCharge', () => {
  it('mapea 1-5 a [-1,1] con 3 neutral', () => {
    expect(toneToCharge(3)).toBe(0)
    expect(toneToCharge(1)).toBe(-1)
    expect(toneToCharge(5)).toBe(1)
  })
  it('clamp fuera de rango y no-finitos', () => {
    expect(toneToCharge(0)).toBe(-1)
    expect(toneToCharge(9)).toBe(1)
    expect(toneToCharge(NaN)).toBe(0)
  })
})

describe('interactionLogToMemory / Row', () => {
  const log = { id: 'log-9', personId: 'p-1', note: '  hoy fue áspero  ', value: 1, loggedAt: '2026-06-12T10:00:00.000Z' }

  it('arma una memoria episódica manual con id determinístico y nota trimmeada', () => {
    const m = interactionLogToMemory(log)
    expect(m.id).toBe('mem_log:log-9')
    expect(m.type).toBe('episodic')
    expect(m.source).toBe('manual')
    expect(m.content).toBe('hoy fue áspero')
    expect(m.personId).toBe('p-1')
    expect(m.entities).toEqual(['p-1'])
    expect(m.emotionalCharge).toBe(-1) // tono 1/5
    expect(m.importance).toBe(6)
    expect(m.timestamp).toBe(log.loggedAt)
  })

  it('Row mapea snake_case y NO incluye observation_id', () => {
    const row = interactionLogToMemoryRow(log, 'user-1')
    expect(row.id).toBe('mem_log:log-9')
    expect(row.user_id).toBe('user-1')
    expect(row.person_id).toBe('p-1')
    expect(row.type).toBe('episodic')
    expect(row.source).toBe('manual')
    expect(row.occurred_at).toBe(log.loggedAt)
    expect(row.emotional_charge).toBe(-1)
    expect('observation_id' in row).toBe(false)
  })
})

describe('isSystemNote / exclusión de meta-notas', () => {
  it('marca notas de sistema', () => {
    expect(isSystemNote('Importado del export de WhatsApp · 69818 mensajes')).toBe(true)
    expect(isSystemNote('  importado del export …')).toBe(true)
  })
  it('no marca notas reales', () => {
    expect(isSystemNote('Hoy hablamos de su emprendimiento')).toBe(false)
  })
  it('shouldMaterializeInteraction NO materializa meta-notas', () => {
    expect(shouldMaterializeInteraction('interaction', 'Importado del export de WhatsApp · 100 mensajes')).toBe(false)
    expect(shouldMaterializeInteraction('interaction', 'Reunión dura sobre growth')).toBe(true)
  })
})
