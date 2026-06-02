import { describe, it, expect } from 'vitest'

import { parseMutualFollowers } from './mutual'

describe('parseMutualFollowers', () => {
  it('ejemplo real de Diana: "X, Y y N más siguen esta cuenta"', () => {
    const r = parseMutualFollowers('its_almendrita, adrian.prog y 12 más siguen esta cuenta')
    expect(r.named).toEqual(['its_almendrita', 'adrian.prog'])
    expect(r.totalCount).toBe(14) // 2 nombrados + 12 más
  })

  it('"N personas más" (variante ES)', () => {
    const r = parseMutualFollowers('its_almendrita, adrian.prog y 12 personas más')
    expect(r.named).toEqual(['its_almendrita', 'adrian.prog'])
    expect(r.totalCount).toBe(14)
  })

  it('inglés: "Followed by X, Y and N others"', () => {
    const r = parseMutualFollowers('Followed by its_almendrita, adrian.prog and 12 others')
    expect(r.named).toEqual(['its_almendrita', 'adrian.prog'])
    expect(r.totalCount).toBe(14)
  })

  it('inglés: "and N more"', () => {
    const r = parseMutualFollowers('Followed by maria_lopez and 3 more')
    expect(r.named).toEqual(['maria_lopez'])
    expect(r.totalCount).toBe(4)
  })

  it('prefijo "Seguido por" sin "N más" (sólo nombres)', () => {
    const r = parseMutualFollowers('Seguido por its_almendrita y adrian.prog')
    expect(r.named).toEqual(['its_almendrita', 'adrian.prog'])
    expect(r.totalCount).toBe(2)
  })

  it('un solo seguidor: "X sigue esta cuenta"', () => {
    const r = parseMutualFollowers('maria_lopez sigue esta cuenta')
    expect(r.named).toEqual(['maria_lopez'])
    expect(r.totalCount).toBe(1)
  })

  it('quita el @ inicial de los handles', () => {
    const r = parseMutualFollowers('@its_almendrita, @adrian.prog y 5 más siguen esta cuenta')
    expect(r.named).toEqual(['its_almendrita', 'adrian.prog'])
    expect(r.totalCount).toBe(7)
  })

  it('número con separador de miles ("1.234 más")', () => {
    const r = parseMutualFollowers('maria_lopez y 1.234 más siguen esta cuenta')
    expect(r.named).toEqual(['maria_lopez'])
    expect(r.totalCount).toBe(1235)
  })

  it('dedup de handles repetidos, conservando orden', () => {
    const r = parseMutualFollowers('maria, Maria, juan y 2 más')
    expect(r.named).toEqual(['maria', 'juan'])
    expect(r.totalCount).toBe(4) // 2 únicos + 2 más
  })

  it('"Seguida por" femenino', () => {
    const r = parseMutualFollowers('Seguida por ana.gomez y 4 más')
    expect(r.named).toEqual(['ana.gomez'])
    expect(r.totalCount).toBe(5)
  })

  it('línea vacía / null / sin data reconocible → datos insuficientes', () => {
    expect(parseMutualFollowers(null)).toEqual({ named: [], totalCount: null })
    expect(parseMutualFollowers('')).toEqual({ named: [], totalCount: null })
    expect(parseMutualFollowers('   ')).toEqual({ named: [], totalCount: null })
    expect(parseMutualFollowers('Editar perfil')).toEqual({ named: ['Editar perfil'], totalCount: 1 })
  })

  it('no inventa: sin nombres ni conteo → null', () => {
    // Una línea que tras recortar prefijo/sufijo queda vacía.
    const r = parseMutualFollowers('siguen esta cuenta')
    expect(r).toEqual({ named: [], totalCount: null })
  })
})
