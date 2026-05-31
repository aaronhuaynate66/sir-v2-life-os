// SIR V2 — Tests del serializador CSV (Export).
//
// escapeCsvValue + buildCsv son puros → deterministas. Cubrimos los casos
// borde pedidos: comas, comillas dobles, saltos de línea (LF/CRLF), valores
// null/undefined, unicode, números/booleanos, y el armado completo
// (headers + filas, CRLF, vacío).

import { describe, it, expect } from 'vitest'

import { escapeCsvValue, buildCsv, csvFilename, type CsvColumn } from './csv'

describe('escapeCsvValue', () => {
  it('null/undefined → cadena vacía (no "null"/"undefined")', () => {
    expect(escapeCsvValue(null)).toBe('')
    expect(escapeCsvValue(undefined)).toBe('')
  })

  it('cadena simple sin caracteres especiales → sin comillas', () => {
    expect(escapeCsvValue('hola')).toBe('hola')
  })

  it('coma → entrecomilla', () => {
    expect(escapeCsvValue('Lima, Perú')).toBe('"Lima, Perú"')
  })

  it('comilla doble → entrecomilla y duplica la comilla', () => {
    expect(escapeCsvValue('dijo "hola"')).toBe('"dijo ""hola"""')
  })

  it('salto de línea (LF y CRLF) → entrecomilla', () => {
    expect(escapeCsvValue('línea1\nlínea2')).toBe('"línea1\nlínea2"')
    expect(escapeCsvValue('a\r\nb')).toBe('"a\r\nb"')
  })

  it('números y booleanos → String()', () => {
    expect(escapeCsvValue(42)).toBe('42')
    expect(escapeCsvValue(0)).toBe('0')
    expect(escapeCsvValue(-3.5)).toBe('-3.5')
    expect(escapeCsvValue(true)).toBe('true')
    expect(escapeCsvValue(false)).toBe('false')
  })

  it('unicode se preserva tal cual', () => {
    expect(escapeCsvValue('Aarón 🌙 café')).toBe('Aarón 🌙 café')
  })

  it('campo que es solo una coma → entrecomillado', () => {
    expect(escapeCsvValue(',')).toBe('","')
  })

  it('cadena vacía → vacío', () => {
    expect(escapeCsvValue('')).toBe('')
  })
})

interface Row {
  a: string
  b: unknown
}

const COLS: CsvColumn<Row>[] = [
  { header: 'Col A', value: (r) => r.a },
  { header: 'Col B', value: (r) => r.b },
]

describe('buildCsv', () => {
  it('lista vacía → solo la línea de headers', () => {
    expect(buildCsv([], COLS)).toBe('Col A,Col B')
  })

  it('filas separadas por CRLF; headers primero', () => {
    const csv = buildCsv(
      [
        { a: 'x', b: 1 },
        { a: 'y', b: 2 },
      ],
      COLS,
    )
    expect(csv).toBe('Col A,Col B\r\nx,1\r\ny,2')
  })

  it('escapa valores con comas/comillas dentro de las celdas', () => {
    const csv = buildCsv([{ a: 'Lima, PE', b: 'él dijo "ok"' }], COLS)
    expect(csv).toBe('Col A,Col B\r\n"Lima, PE","él dijo ""ok"""')
  })

  it('null/undefined producen celdas vacías', () => {
    const csv = buildCsv([{ a: 'x', b: null }, { a: 'y', b: undefined }], COLS)
    expect(csv).toBe('Col A,Col B\r\nx,\r\ny,')
  })

  it('un header con coma se entrecomilla', () => {
    const csv = buildCsv<Row>([], [{ header: 'A, B', value: (r) => r.a }])
    expect(csv).toBe('"A, B"')
  })
})

describe('csvFilename', () => {
  it('agrega fecha local y extensión', () => {
    expect(csvFilename('finanzas', new Date(2026, 4, 30))).toBe('finanzas_2026-05-30.csv')
  })
})
