// SIR V2 — Tests de los helpers de personas vinculadas a objetivos.

import { describe, it, expect } from 'vitest'

import { togglePersonId, dedupePersonIds, sanitizePersonIds } from './relatedPersons'

describe('dedupePersonIds', () => {
  it('quita duplicados preservando orden', () => {
    expect(dedupePersonIds(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c'])
  })
  it('vacío → vacío', () => {
    expect(dedupePersonIds([])).toEqual([])
  })
})

describe('togglePersonId', () => {
  it('agrega cuando no está', () => {
    expect(togglePersonId(['a'], 'b')).toEqual(['a', 'b'])
  })
  it('quita cuando ya está', () => {
    expect(togglePersonId(['a', 'b'], 'a')).toEqual(['b'])
  })
  it('toggle dos veces vuelve al estado original', () => {
    const once = togglePersonId(['a'], 'b')
    expect(togglePersonId(once, 'b')).toEqual(['a'])
  })
  it('no duplica si el estado venía con duplicados', () => {
    expect(togglePersonId(['a', 'a'], 'b')).toEqual(['a', 'b'])
  })
  it('no muta el array de entrada', () => {
    const input = ['a', 'b']
    togglePersonId(input, 'c')
    expect(input).toEqual(['a', 'b'])
  })
})

describe('sanitizePersonIds', () => {
  it('filtra ids que no existen en el set válido, deduplicado', () => {
    expect(sanitizePersonIds(['a', 'fantasma', 'b', 'a'], ['a', 'b', 'c'])).toEqual(['a', 'b'])
  })
  it('acepta un Set como validIds', () => {
    expect(sanitizePersonIds(['x', 'y'], new Set(['y']))).toEqual(['y'])
  })
  it('todo inválido → vacío', () => {
    expect(sanitizePersonIds(['z'], ['a'])).toEqual([])
  })
})
