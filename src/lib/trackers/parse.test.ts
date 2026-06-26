// SIR V2 — Tests del parser puro de valor/fecha (trackers).

import { describe, it, expect } from 'vitest'
import { parseNumber, detectUnit, extractDate, extractValueDateFromText, readingDate } from './parse'

describe('parseNumber', () => {
  it('miles con coma → entero', () => {
    expect(parseNumber('5,075')).toBe(5075)
  })
  it('miles con punto → entero', () => {
    expect(parseNumber('5.075')).toBe(5075)
  })
  it('decimal con coma', () => {
    expect(parseNumber('5,5')).toBe(5.5)
    expect(parseNumber('12,50')).toBe(12.5)
  })
  it('decimal con punto', () => {
    expect(parseNumber('5.50')).toBe(5.5)
  })
  it('US: coma miles + punto decimal', () => {
    expect(parseNumber('5,075.50')).toBe(5075.5)
  })
  it('EU: punto miles + coma decimal', () => {
    expect(parseNumber('5.075,50')).toBe(5075.5)
  })
  it('millones US', () => {
    expect(parseNumber('1,234,567')).toBe(1234567)
  })
  it('entero pelado', () => {
    expect(parseNumber('4500')).toBe(4500)
  })
  it('strings sin número → null', () => {
    expect(parseNumber('abc')).toBeNull()
    expect(parseNumber('')).toBeNull()
  })
})

describe('detectUnit', () => {
  it('PEN explícito', () => {
    expect(detectUnit('PEN 5,075')).toBe('PEN')
  })
  it('símbolo soles S/', () => {
    expect(detectUnit('S/ 5,075')).toBe('PEN')
  })
  it('USD y US$', () => {
    expect(detectUnit('USD 1300')).toBe('USD')
    expect(detectUnit('US$ 1300')).toBe('USD')
  })
  it('$ suelto → USD', () => {
    expect(detectUnit('$1,300')).toBe('USD')
  })
  it('sin moneda → null', () => {
    expect(detectUnit('faltan 30 días')).toBeNull()
  })
})

describe('extractDate', () => {
  it('ISO directo', () => {
    expect(extractDate('salida 2026-07-06', 2026)).toBe('2026-07-06')
  })
  it('DD/MM/YYYY (Perú)', () => {
    expect(extractDate('06/07/2026', 2026)).toBe('2026-07-06')
  })
  it('DD/MM/YY → 20YY', () => {
    expect(extractDate('06/07/26', 2026)).toBe('2026-07-06')
  })
  it('nombre de mes español "6 jul"', () => {
    expect(extractDate('sáb 6 jul', 2026)).toBe('2026-07-06')
  })
  it('nombre de mes inglés "Jul 6, 2026"', () => {
    expect(extractDate('Sat, Jul 6, 2026', 2026)).toBe('2026-07-06')
  })
  it('"6 de julio de 2026"', () => {
    expect(extractDate('6 de julio de 2026', 2026)).toBe('2026-07-06')
  })
  it('sin fecha → null', () => {
    expect(extractDate('PEN 5075', 2026)).toBeNull()
  })
})

describe('extractValueDateFromText (Google Flights)', () => {
  it('mail típico: PEN 5,075 + fecha', () => {
    const r = extractValueDateFromText(
      'Tu vuelo Lima → Dammam ida y vuelta desde PEN 5,075. Sale el 6 jul 2026.',
      2026,
    )
    expect(r.value).toBe(5075)
    expect(r.unit).toBe('PEN')
    expect(r.date).toBe('2026-07-06')
  })

  it('prioriza el número junto a la moneda, no la hora', () => {
    const r = extractValueDateFromText('Vuelo 08:45 — total PEN 4,499 ida/vuelta', 2026)
    expect(r.value).toBe(4499)
    expect(r.unit).toBe('PEN')
  })

  it('soporta símbolo antes y número grande con separador US', () => {
    const r = extractValueDateFromText('Precio: USD 1,299.99', 2026)
    expect(r.value).toBe(1299.99)
    expect(r.unit).toBe('USD')
  })

  it('sin moneda: toma el primer número', () => {
    const r = extractValueDateFromText('Quedan 4500 millas', 2026)
    expect(r.value).toBe(4500)
    expect(r.unit).toBeNull()
  })

  it('sin número → value null', () => {
    const r = extractValueDateFromText('no hay precio acá', 2026)
    expect(r.value).toBeNull()
  })
})

describe('readingDate', () => {
  it('siempre usa la fecha de captura (ignora fechas del contenido, ej. la del vuelo)', () => {
    expect(readingDate('2026-06-26')).toBe('2026-06-26')
  })
})
