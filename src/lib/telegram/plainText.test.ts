import { describe, it, expect } from 'vitest'
import { stripMarkdown } from './plainText'

describe('stripMarkdown', () => {
  it('quita **negrita** conservando el texto (el caso reportado)', () => {
    expect(stripMarkdown('funciona de forma **pasiva**: captura datos'))
      .toBe('funciona de forma pasiva: captura datos')
  })
  it('quita varias negritas en una línea', () => {
    expect(stripMarkdown('en tu **computadora**, no en el **celular**'))
      .toBe('en tu computadora, no en el celular')
  })
  it('quita `código`, ## títulos y links', () => {
    expect(stripMarkdown('## Estado\nCorré `npm run test` y mirá [el PR](https://x.com/pr/1)'))
      .toBe('Estado\nCorré npm run test y mirá el PR (https://x.com/pr/1)')
  })
  it('convierte viñetas markdown en •', () => {
    expect(stripMarkdown('- uno\n- dos')).toBe('• uno\n• dos')
  })
  it('itálica _y_ *asteriscos* sueltos', () => {
    expect(stripMarkdown('esto es _importante_ y *urgente*')).toBe('esto es importante y urgente')
  })
  it('no rompe texto sin markdown ni asteriscos legítimos en medio', () => {
    expect(stripMarkdown('el rango es 3*4 y ya')).toBe('el rango es 3*4 y ya')
    expect(stripMarkdown('hola, todo bien')).toBe('hola, todo bien')
  })
  it('barre ** sueltos que hayan quedado', () => {
    expect(stripMarkdown('roto ** por la mitad')).toBe('roto  por la mitad')
  })
  it('string vacío', () => {
    expect(stripMarkdown('')).toBe('')
  })
})
