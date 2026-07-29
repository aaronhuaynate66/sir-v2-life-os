import { describe, it, expect } from 'vitest'

import { buildOrgBatch, MAX_POR_LOTE, nombreDesdeHandle, parseExclusiones, parseOrgBatch } from './orgBatch'

const cuenta = (handle: string) => ({ handle, razon: 'el handle dice "sac"' })

describe('buildOrgBatch', () => {
  it('numera las cuentas y dice por qué cada una', () => {
    const lote = buildOrgBatch([
      { handle: 'impalaairguns', razon: 'el handle dice "airguns"' },
      { handle: 'johnholdenuniformes', razon: 'el handle dice "uniformes"' },
    ], 'br|org_ok|1', 'br|org_no|1')!
    expect(lote.text).toContain('1. @impalaairguns — el handle dice "airguns"')
    expect(lote.text).toContain('2. @johnholdenuniformes — el handle dice "uniformes"')
    expect(lote.handles).toEqual(['impalaairguns', 'johnholdenuniformes'])
  })

  it('explica cómo excluir, porque el botón solo dice sí o no', () => {
    const lote = buildOrgBatch([cuenta('a_sac'), cuenta('b_sac')], 'ok', 'no')!
    expect(lote.text).toMatch(/respóndeme con sus números/i)
  })

  it('con UNA sola cuenta no habla en plural ni pide números', () => {
    const lote = buildOrgBatch([cuenta('a_sac')], 'ok', 'no')!
    expect(lote.text).not.toMatch(/números/i)
    expect(lote.keyboard[0][0].text).toContain('la 1')
  })

  it('corta en MAX_POR_LOTE y avisa cuántas quedan', () => {
    const muchas = Array.from({ length: MAX_POR_LOTE + 14 }, (_, i) => cuenta(`cuenta${i}_sac`))
    const lote = buildOrgBatch(muchas, 'ok', 'no')!
    expect(lote.handles).toHaveLength(MAX_POR_LOTE)
    expect(lote.text).toContain('Quedan 14 más')
  })

  it('lote vacío → null (no se manda un mensaje sin contenido)', () => {
    expect(buildOrgBatch([], 'ok', 'no')).toBeNull()
  })

  it('nada de voseo en lo que Aaron lee', () => {
    const lote = buildOrgBatch([cuenta('a_sac'), cuenta('b_sac')], 'ok', 'no')!
    expect(lote.text).not.toMatch(/\b(respondé|decime|marcá|sacá|tenés|querés)\b/i)
  })
})

describe('parseOrgBatch — el estado se recupera del texto', () => {
  it('va y vuelve: lo que se numeró es lo que se lee', () => {
    const handles = ['impalaairguns', 'k9_peru_sac', 'vitamedical.pe']
    const lote = buildOrgBatch(handles.map(cuenta), 'ok', 'no')!
    expect(parseOrgBatch(lote.text)).toEqual(handles)
  })

  it('un texto que no es un lote devuelve vacío', () => {
    expect(parseOrgBatch('1. @algo — hola')).toEqual([])
    expect(parseOrgBatch('')).toEqual([])
  })

  it('si la numeración está rota, corta ahí en vez de adivinar', () => {
    const lote = buildOrgBatch([cuenta('a_sac'), cuenta('b_sac'), cuenta('c_sac')], 'ok', 'no')!
    const roto = lote.text.replace('2. @b_sac', '9. @b_sac')
    expect(parseOrgBatch(roto)).toEqual(['a_sac'])
  })
})

describe('parseExclusiones', () => {
  it('lee varios formatos de respuesta', () => {
    expect(parseExclusiones('3, 7', 10)).toEqual([2, 6])
    expect(parseExclusiones('el 3 y el 7', 10)).toEqual([2, 6])
    expect(parseExclusiones('3 7', 10)).toEqual([2, 6])
  })

  it('descarta lo que está fuera de rango en vez de dar la vuelta', () => {
    // "35" en un lote de 30 no es "el 5": tomarlo así sería inventarle intención.
    expect(parseExclusiones('35', 30)).toEqual([])
    expect(parseExclusiones('0', 30)).toEqual([])
  })

  it('no repite ni desordena', () => {
    expect(parseExclusiones('7, 3, 7', 10)).toEqual([2, 6])
  })

  it('sin números → no excluye nada', () => {
    expect(parseExclusiones('todas están bien', 10)).toEqual([])
    expect(parseExclusiones('', 10)).toEqual([])
  })
})

describe('nombreDesdeHandle', () => {
  it('arma un nombre legible', () => {
    expect(nombreDesdeHandle('@voxpopuli.consultoria')).toBe('Voxpopuli Consultoria')
    expect(nombreDesdeHandle('k9_peru_sac')).toBe('K9 Peru Sac')
  })

  it('CONSERVA los dígitos: a veces son el nombre', () => {
    // "Bomberos Salamanca 127" — perder el 127 sería perder cuál unidad es.
    expect(nombreDesdeHandle('salamanca127')).toBe('Salamanca127')
  })

  it('saca la cola de dominio, que no es parte del nombre', () => {
    expect(nombreDesdeHandle('vitamedical.pe')).toBe('Vitamedical')
    expect(nombreDesdeHandle('escalagon.ai')).toBe('Escalagon')
    expect(nombreDesdeHandle('buho.la')).toBe('Buho')
  })

  it('…pero no si la cola es lo único que hay', () => {
    expect(nombreDesdeHandle('pe')).toBe('Pe')
  })
})

// Copy: el plural de "organización" pierde el acento. Salió mal en la prueba
// contra la base real ("2 organizaciónes") y es texto que Aaron lee.
describe('plural de organización', () => {
  it('no deja "organizaciónes" en ningún lado', () => {
    const lote = buildOrgBatch([cuenta('a_sac'), cuenta('b_sac')], 'ok', 'no')!
    expect(lote.text).not.toContain('organizaciónes')
    expect(lote.text).toContain('organizaciones')
  })
})
