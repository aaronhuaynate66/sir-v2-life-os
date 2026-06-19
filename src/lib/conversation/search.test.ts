import { describe, it, expect } from 'vitest'
import { searchArchive, tailCap } from './search'

const raw = [
  '[10/05/26, 09:00:00] Ana: hola, te paso la PROPUESTA mañana',
  '[11/05/26, 10:00:00] Aaron: dale, gracias',
  '[12/05/26, 11:00:00] Ana: la propuesta quedó lista',
].join('\n')

describe('searchArchive', () => {
  it('encuentra líneas (acento/caso-insensible) con su fecha', () => {
    const hits = searchArchive(raw, 'propuesta')
    expect(hits).toHaveLength(2)
    expect(hits[0].date).toBe('10/05/26')
    expect(hits[1].snippet).toContain('quedó lista')
  })
  it('query corta o vacía → nada', () => {
    expect(searchArchive(raw, 'a')).toHaveLength(0)
  })
  it('respeta el máximo', () => {
    expect(searchArchive(raw, '26', 1)).toHaveLength(1)
  })
})

describe('tailCap', () => {
  it('no toca si entra', () => {
    expect(tailCap('hola', 100)).toEqual({ text: 'hola', truncated: false })
  })
  it('corta por el comienzo en un salto de línea y marca truncated', () => {
    const t = 'linea1\nlinea2\nlinea3'
    const r = tailCap(t, 12) // mantiene el final
    expect(r.truncated).toBe(true)
    expect(r.text.startsWith('linea')).toBe(true)
    expect(r.text.length).toBeLessThanOrEqual(12)
  })
})
