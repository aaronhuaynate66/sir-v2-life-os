// SIR V2 — Tests de la clasificación de "columna inexistente".
//
// Importa acertar porque de esto depende si una lectura reintenta SIN el filtro
// de privacidad. Un falso positivo abre la puerta; por eso la duda vale false.
import { describe, it, expect } from 'vitest'
import { esColumnaInexistente, CODIGO_COLUMNA_INEXISTENTE } from './columnaFaltante'

describe('lo que SÍ es una columna faltante', () => {
  it('por código de Postgres', () => {
    expect(esColumnaInexistente({ code: CODIGO_COLUMNA_INEXISTENTE })).toBe(true)
    expect(CODIGO_COLUMNA_INEXISTENTE).toBe('42703')
  })

  it('por mensaje, cuando PostgREST no propaga el código', () => {
    expect(esColumnaInexistente({ message: 'column memories.is_private does not exist' })).toBe(true)
    expect(esColumnaInexistente({ message: "Could not find the 'is_obsolete' column of 'memories'" })).toBe(true)
    expect(esColumnaInexistente({ message: 'column "x" of relation "memories" does not exist' })).toBe(true)
  })

  it('sin importar mayúsculas', () => {
    expect(esColumnaInexistente({ message: 'COLUMN memories.is_private DOES NOT EXIST' })).toBe(true)
  })
})

describe('lo que NO lo es — acá está el punto', () => {
  it('un error transitorio NO habilita el reintento sin filtro', () => {
    // Este es el caso que motivó el módulo: antes, cualquiera de estos hacía que
    // la consulta se reintentara SIN el filtro de privacidad.
    for (const e of [
      { code: '57014', message: 'canceling statement due to statement timeout' },
      { message: 'fetch failed' },
      { message: 'TypeError: network error' },
      { code: '500', message: 'Internal Server Error' },
      { code: '42501', message: 'permission denied for table memories' },
    ]) {
      expect(esColumnaInexistente(e), `no debería tratarse como columna faltante: ${e.message}`).toBe(false)
    }
  })

  it('una TABLA inexistente no es una columna inexistente', () => {
    expect(esColumnaInexistente({ message: 'relation "memories" does not exist' })).toBe(false)
  })

  it('ante la duda, false: el default no abre la puerta', () => {
    expect(esColumnaInexistente(null)).toBe(false)
    expect(esColumnaInexistente(undefined)).toBe(false)
    expect(esColumnaInexistente({})).toBe(false)
    expect(esColumnaInexistente({ code: null, message: null })).toBe(false)
    expect(esColumnaInexistente({ message: '' })).toBe(false)
  })
})
