import { describe, it, expect } from 'vitest'
import {
  franjaOfHour,
  hhmmToMinutes,
  detectFranjaFromText,
  detectHourFromText,
  FRANJA_LABEL,
} from './timeContext'

describe('franjaOfHour — bordes de cada franja', () => {
  it('madrugada: 0..5', () => {
    expect(franjaOfHour(0)).toBe('madrugada')
    expect(franjaOfHour(5)).toBe('madrugada')
  })
  it('mañana: 6..11', () => {
    expect(franjaOfHour(6)).toBe('mañana')
    expect(franjaOfHour(11)).toBe('mañana')
  })
  it('mediodia: 12..14', () => {
    expect(franjaOfHour(12)).toBe('mediodia')
    expect(franjaOfHour(14)).toBe('mediodia')
  })
  it('tarde: 15..19', () => {
    expect(franjaOfHour(15)).toBe('tarde')
    expect(franjaOfHour(19)).toBe('tarde')
  })
  it('noche: 20..23', () => {
    expect(franjaOfHour(20)).toBe('noche')
    expect(franjaOfHour(23)).toBe('noche')
  })
  it('cada franja tiene label legible', () => {
    expect(FRANJA_LABEL[franjaOfHour(9)]).toBe('por la mañana')
    expect(FRANJA_LABEL[franjaOfHour(21)]).toBe('por la noche')
  })
})

describe('hhmmToMinutes', () => {
  it('convierte HH:MM válido a minutos del día', () => {
    expect(hhmmToMinutes('00:00')).toBe(0)
    expect(hhmmToMinutes('07:30')).toBe(450)
    expect(hhmmToMinutes('23:59')).toBe(1439)
    expect(hhmmToMinutes('9:05')).toBe(545) // 1 dígito de hora
  })
  it('null si formato o rango inválido', () => {
    expect(hhmmToMinutes(null)).toBeNull()
    expect(hhmmToMinutes(undefined)).toBeNull()
    expect(hhmmToMinutes('')).toBeNull()
    expect(hhmmToMinutes('7')).toBeNull()
    expect(hhmmToMinutes('24:00')).toBeNull() // hora fuera de rango
    expect(hhmmToMinutes('10:60')).toBeNull() // minuto fuera de rango
    expect(hhmmToMinutes('mañana')).toBeNull()
  })
})

describe('detectFranjaFromText', () => {
  it('anclas cotidianas (más específicas que nombres de franja)', () => {
    expect(detectFranjaFromText('antes de dormir')).toBe('noche')
    expect(detectFranjaFromText('apenas me levanto')).toBe('mañana')
    expect(detectFranjaFromText('después de almorzar')).toBe('mediodia')
    expect(detectFranjaFromText('luego de cenar')).toBe('noche')
  })
  it('nombres de franja, tolerante a tildes/variantes', () => {
    expect(detectFranjaFromText('en la madrugada')).toBe('madrugada')
    expect(detectFranjaFromText('por la manana')).toBe('mañana') // sin tilde
    expect(detectFranjaFromText('al mediodia')).toBe('mediodia')
    expect(detectFranjaFromText('por la tarde')).toBe('tarde')
    expect(detectFranjaFromText('de noche')).toBe('noche')
  })
  it('null sin señal temporal / vacío', () => {
    expect(detectFranjaFromText('correr 5km')).toBeNull()
    expect(detectFranjaFromText(null)).toBeNull()
    expect(detectFranjaFromText('')).toBeNull()
  })
})

describe('detectHourFromText', () => {
  it('HH:MM explícito', () => {
    expect(detectHourFromText('19:30')).toBe(19)
    expect(detectHourFromText('a las 7:00')).toBe(7)
  })
  it('"a las N" / "N am|pm"', () => {
    expect(detectHourFromText('a las 7')).toBe(7)
    expect(detectHourFromText('7am')).toBe(7)
    expect(detectHourFromText('7 pm')).toBe(19) // pm suma 12
    expect(detectHourFromText('12am')).toBe(0) // medianoche
    expect(detectHourFromText('12pm')).toBe(12) // mediodía se queda 12
  })
  it('null sin hora / hora inválida', () => {
    expect(detectHourFromText('correr un rato')).toBeNull()
    expect(detectHourFromText(null)).toBeNull()
    expect(detectHourFromText('')).toBeNull()
  })
})
