// SIR V2 — Tests 15·7 (lazos débiles de Granovetter).

import { describe, it, expect } from 'vitest'
import { weakTiesForGoal, type WeakTiePerson } from './network'

const people: WeakTiePerson[] = [
  { id: 'a', name: 'Ana Íntima', category: 'inner_circle', organization: 'Marlab', importance: 9 },
  { id: 'b', name: 'Beto Conocido', category: 'network', organization: 'Boticas Jhodaal', title: 'Comprador', importance: 4 },
  { id: 'c', name: 'Caro Lejana', category: 'peripheral', title: 'Gerenta de farmacia', tags: ['botica', 'retail'], importance: 3 },
  { id: 'd', name: 'Dani Sinrelacion', category: 'network', organization: 'Panadería La Espiga', importance: 5 },
]

describe('weakTiesForGoal', () => {
  it('trae conocidos (network/peripheral) cuyo dominio matchea el objetivo', () => {
    const ties = weakTiesForGoal('Cerrar Boticas Jhodaal como cliente de Marlab', people)
    const ids = ties.map((t) => t.personId)
    expect(ids).toContain('b') // organización = "Boticas Jhodaal"
    expect(ids).not.toContain('a') // íntimo, no es lazo débil aunque matchee (Marlab)
    expect(ids).not.toContain('d') // conocido pero sin match de dominio
  })

  it('matchea por tags/título además de organización', () => {
    const ties = weakTiesForGoal('Conseguir un contrato de botica nueva', people)
    expect(ties.map((t) => t.personId)).toContain('c') // tag "botica"
  })

  it('la razón nombra el vínculo débil y la puerta', () => {
    const ties = weakTiesForGoal('Cerrar Boticas Jhodaal', people)
    const beto = ties.find((t) => t.personId === 'b')
    expect(beto?.reason).toMatch(/abren puertas nuevas/)
    expect(beto?.overlap).toContain('boticas')
  })

  it('sin match de dominio → vacío (no inventa)', () => {
    expect(weakTiesForGoal('Correr una maratón en Cusco', people)).toHaveLength(0)
  })

  it('objetivo solo con palabras vacías → vacío', () => {
    expect(weakTiesForGoal('para el que con los', people)).toHaveLength(0)
  })

  it('rankea por cantidad de match', () => {
    const extra: WeakTiePerson[] = [
      ...people,
      { id: 'e', name: 'Eva DobleMatch', category: 'network', organization: 'Boticas Jhodaal', tags: ['marlab'], importance: 2 },
    ]
    const ties = weakTiesForGoal('Cerrar Boticas Jhodaal para Marlab', extra)
    expect(ties[0].personId).toBe('e') // matchea "boticas" + "marlab"
  })
})
