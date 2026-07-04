// SIR V2 — Tests de red flags de auto-protección (19·M3).

import { describe, it, expect } from 'vitest'
import { detectRelationalFlags } from './index'

describe('detectRelationalFlags', () => {
  it('sin notas → nada, nivel none', () => {
    const r = detectRelationalFlags([])
    expect(r.flags).toHaveLength(0)
    expect(r.level).toBe('none')
    expect(r.seekSupport).toBe(false)
  })

  it('exige RECURRENCIA: una sola nota no enciende nada', () => {
    const r = detectRelationalFlags(['hoy me humilló delante de todos', 'salimos a cenar'])
    expect(r.flags).toHaveLength(0)
    expect(r.level).toBe('none')
  })

  it('un patrón que se repite 2 veces → watch', () => {
    const r = detectRelationalFlags([
      'otra vez me controla con quién hablo',
      'me controla el celular, revisa mi whatsapp',
      'lindo día',
    ])
    expect(r.flags.map((f) => f.flag)).toContain('control')
    expect(r.level).toBe('watch')
    expect(r.seekSupport).toBe(false)
  })

  it('un patrón fuerte (≥3) → concern + seekSupport', () => {
    const r = detectRelationalFlags([
      'me hace dudar de lo que pasó',
      'dice que estoy loco cuando reclamo',
      'niega que dijo eso, me confunde',
    ])
    const g = r.flags.find((f) => f.flag === 'gaslighting')
    expect(g?.occurrences).toBe(3)
    expect(r.level).toBe('concern')
    expect(r.seekSupport).toBe(true)
  })

  it('≥2 patrones distintos recurrentes → concern', () => {
    const r = detectRelationalFlags([
      'me controla a dónde voy',
      'no me deja ver a mis amigos',
      'me aisló de mi familia',
      'me controla el dinero',
    ])
    const kinds = r.flags.map((f) => f.flag)
    expect(kinds).toContain('control')
    expect(kinds).toContain('isolation')
    expect(r.level).toBe('concern')
  })

  it('ordena por frecuencia y trae el consejo de protección', () => {
    const r = detectRelationalFlags([
      'me menosprecia', 'me humilla', 'me insulta', 'me controla', 'me controla',
    ])
    expect(r.flags[0].flag).toBe('devaluation') // 3 > 2
    expect(r.flags[0].care).toMatch(/valor real/i)
  })

  it('ignora notas vacías/nulas', () => {
    const r = detectRelationalFlags([null, '', '   ', 'me controla', 'me controla'])
    expect(r.entriesScanned).toBe(2)
    expect(r.flags[0].flag).toBe('control')
  })
})
