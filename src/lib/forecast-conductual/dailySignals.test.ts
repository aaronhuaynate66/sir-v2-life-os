// SIR V2 — Tests del extractor de señales diarias.

import { describe, it, expect } from 'vitest'
import { buildDailySignals } from './dailySignals'
import type { ChatMessage } from './types'

const M = (at: string, author: 'user' | 'other', text: string, kind?: ChatMessage['kind']): ChatMessage => ({ at, author, text, kind })

describe('buildDailySignals', () => {
  it('detecta somático (dolor+medicación) y sensibilidad en el texto de la persona', () => {
    const [d] = buildDailySignals([
      M('2026-07-10T09:00:00Z', 'other', 'me duele la cabeza horrible'),
      M('2026-07-10T09:05:00Z', 'other', 'me tomé una pastilla'),
      M('2026-07-10T10:00:00Z', 'other', 'ando triste y sensible hoy'),
    ])
    expect(d.date).toBe('2026-07-10')
    expect(d.somatic).toBeGreaterThan(0)
    expect(d.sensitivity).toBeGreaterThan(0)
    expect(d.composite).toBeGreaterThan(0)
  })
  it('ignora los mensajes de Aaron (user) y los no-texto', () => {
    const out = buildDailySignals([
      M('2026-07-11T09:00:00Z', 'user', 'me duele todo'), // no cuenta (user)
      M('2026-07-11T09:01:00Z', 'other', '', 'audio'),     // no cuenta (audio)
    ])
    expect(out).toHaveLength(0)
  })
  it('capta fricción', () => {
    const [d] = buildDailySignals([M('2026-07-12T09:00:00Z', 'other', 'estoy harta, déjame en paz')])
    expect(d.friction).toBeGreaterThan(0)
  })
  it('ordena por fecha y separa por día', () => {
    const out = buildDailySignals([
      M('2026-07-13T09:00:00Z', 'other', 'hola'),
      M('2026-07-12T09:00:00Z', 'other', 'buenas'),
    ])
    expect(out.map((d) => d.date)).toEqual(['2026-07-12', '2026-07-13'])
  })
})
