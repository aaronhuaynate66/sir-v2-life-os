import { describe, it, expect } from 'vitest'
import { suggestPersonForHandle } from './suggestMatch'

const people = [
  { id: 'p1', name: 'Fiorella Nicolini' },
  { id: 'p2', name: 'Diego Medina Stein' },
  { id: 'p3', name: 'Yoshua Andre Ruiz Arguedas' },
  { id: 'p4', name: 'Ana Torres' },
]

describe('suggestPersonForHandle', () => {
  it('handle = nombre pegado → sugiere alta confianza', () => {
    const s = suggestPersonForHandle({ handle: 'fiorellanicolini', name: null }, people)
    expect(s?.personId).toBe('p1')
    expect(s?.confidence).toBe('alta')
  })

  it('nombre completo largo pegado (varios tokens)', () => {
    const s = suggestPersonForHandle({ handle: 'yoshuaandreruizarguedas', name: null }, people)
    expect(s?.personId).toBe('p3')
  })

  it('inicial + apellido ("dmedina" → Diego Medina) → media confianza', () => {
    const s = suggestPersonForHandle({ handle: 'dmedina', name: null }, people)
    expect(s?.personId).toBe('p2')
    expect(s?.confidence).toBe('media')
  })

  it('handle con sufijo pero contiene el nombre ("fiorellanicolini_23")', () => {
    const s = suggestPersonForHandle({ handle: 'fiorellanicolini_23', name: null }, people)
    expect(s?.personId).toBe('p1')
  })

  it('usa el nombre capturado si el handle no ayuda', () => {
    const s = suggestPersonForHandle({ handle: 'xyz_random_99', name: 'Ana Torres' }, people)
    expect(s?.personId).toBe('p4')
  })

  it('empresa / desconocido → sin sugerencia (null)', () => {
    expect(suggestPersonForHandle({ handle: 'corporacionaxion', name: null }, people)).toBeNull()
    expect(suggestPersonForHandle({ handle: 'johnholdenuniformes', name: null }, people)).toBeNull()
    expect(suggestPersonForHandle({ handle: 'gato_pe', name: null }, people)).toBeNull()
  })

  it('vacío → null', () => {
    expect(suggestPersonForHandle({ handle: null, name: null }, people)).toBeNull()
    expect(suggestPersonForHandle({ handle: '', name: '' }, people)).toBeNull()
  })

  it('ambiguo (dos personas mismo puntaje) → null, no arriesga', () => {
    const dupes = [
      { id: 'a', name: 'Ana Torres' },
      { id: 'b', name: 'Ana Torres' },
    ]
    expect(suggestPersonForHandle({ handle: null, name: 'Ana Torres' }, dupes)).toBeNull()
  })
})
