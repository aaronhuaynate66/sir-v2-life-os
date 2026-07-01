import { describe, it, expect } from 'vitest'
import { findDuplicatePeople } from './duplicates'

describe('findDuplicatePeople', () => {
  it('agrupa mismo nombre con distinta grafía (acentos/casing)', () => {
    const g = findDuplicatePeople([
      { id: '1', name: 'Nicolle Huaynate Espinoza' },
      { id: '2', name: 'nicolle huaynate espinoza' },
      { id: '3', name: 'Francisco Benavides' },
    ])
    expect(g).toHaveLength(1)
    expect(g[0].map((p) => p.id).sort()).toEqual(['1', '2'])
  })

  it('agrupa por alias que coincide con el nombre de otra', () => {
    const g = findDuplicatePeople([
      { id: '1', name: 'Papá', alias: 'Fernando Brañes' },
      { id: '2', name: 'Fernando Brañes' },
    ])
    expect(g).toHaveLength(1)
    expect(g[0]).toHaveLength(2)
  })

  it('no agrupa personas distintas', () => {
    const g = findDuplicatePeople([
      { id: '1', name: 'Ana' },
      { id: '2', name: 'Beto' },
      { id: '3', name: 'Carla' },
    ])
    expect(g).toHaveLength(0)
  })

  it('ignora nombres demasiado cortos como clave', () => {
    const g = findDuplicatePeople([
      { id: '1', name: 'A' },
      { id: '2', name: 'A' },
    ])
    expect(g).toHaveLength(0)
  })

  it('agrupa "single-token" con match de primer nombre (caso Cristina)', () => {
    // El seed batch creó "Cristina" (sin apellido). Ya existía "Cristina
    // Fuentes Chacaltana". Ambas son la misma persona → deben agruparse.
    const g = findDuplicatePeople([
      { id: '1', name: 'Cristina' },
      { id: '2', name: 'Cristina Fuentes Chacaltana' },
      { id: '3', name: 'Diana' },
    ])
    expect(g).toHaveLength(1)
    expect(g[0].map((p) => p.id).sort()).toEqual(['1', '2'])
  })

  it('NO agrupa 2 personas con nombre + apellidos distintos aunque compartan primer nombre', () => {
    // Cristina Fuentes vs Cristina Perez → distintas, no agrupar.
    const g = findDuplicatePeople([
      { id: '1', name: 'Cristina Fuentes' },
      { id: '2', name: 'Cristina Perez' },
    ])
    expect(g).toHaveLength(0)
  })

  it('single-token con múltiples matches "long-name" une a todos', () => {
    const g = findDuplicatePeople([
      { id: '1', name: 'Juan' },
      { id: '2', name: 'Juan Perez' },
      { id: '3', name: 'Juan Rodriguez' },
    ])
    // Los 3 quedan en el mismo grupo — Aaron desambigua a mano cuál es cuál.
    expect(g).toHaveLength(1)
    expect(g[0]).toHaveLength(3)
  })

  it('single-token de nombre GENÉRICO no dispara match parcial', () => {
    // "De" es genérico → no debería agrupar.
    const g = findDuplicatePeople([
      { id: '1', name: 'De' },
      { id: '2', name: 'De la Cruz' },
    ])
    expect(g).toHaveLength(0)
  })

  it('prefijo por tokens: "Fabiola Masías" agrupa con "Fabiola Masías Ponce"', () => {
    // Caso real del 01-jul: pre-existía "Fabiola Masías" y el batch de LinkedIn
    // subió "Fabiola Masías Ponce". Ambas son la misma persona.
    const g = findDuplicatePeople([
      { id: '1', name: 'Fabiola Masías' },
      { id: '2', name: 'Fabiola Masías Ponce' },
      { id: '3', name: 'Roberto Sánchez' },
    ])
    expect(g).toHaveLength(1)
    expect(g[0].map((p) => p.id).sort()).toEqual(['1', '2'])
  })

  it('prefijo por tokens NO agrupa si el 2do token difiere', () => {
    // "Fabiola Ruiz" NO es prefijo de "Fabiola Masías Ponce" (2do token distinto).
    const g = findDuplicatePeople([
      { id: '1', name: 'Fabiola Ruiz' },
      { id: '2', name: 'Fabiola Masías Ponce' },
    ])
    expect(g).toHaveLength(0)
  })

  it('prefijo por tokens agrupa en cadena "A B" ⊂ "A B C" ⊂ "A B C D"', () => {
    const g = findDuplicatePeople([
      { id: '1', name: 'Fabiola Masías' },
      { id: '2', name: 'Fabiola Masías Ponce' },
      { id: '3', name: 'Fabiola Masías Ponce Rey' },
    ])
    expect(g).toHaveLength(1)
    expect(g[0]).toHaveLength(3)
  })
})
