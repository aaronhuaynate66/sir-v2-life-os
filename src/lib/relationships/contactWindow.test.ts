import { describe, it, expect } from 'vitest'
import { computeContactWindow, type ContactSignals } from './contactWindow'

const base: ContactSignals = {
  daysSinceContact: 3, upcomingEventInDays: null, openConflict: false,
  lastTone: null, cycleSensitive: false, importance: 5,
}

describe('computeContactWindow', () => {
  it('conflicto abierto → con_cuidado (gana sobre todo)', () => {
    const r = computeContactWindow({ ...base, openConflict: true, conflictTitle: 'Mundial', upcomingEventInDays: 1 })
    expect(r.state).toBe('con_cuidado')
    expect(r.reason).toContain('Mundial')
  })
  it('última charla tensa → con_cuidado', () => {
    expect(computeContactWindow({ ...base, lastTone: 2 }).state).toBe('con_cuidado')
  })
  it('ciclo sensible → con_cuidado, con encuadre de cuidado (no evitar)', () => {
    const r = computeContactWindow({ ...base, cycleSensitive: true })
    expect(r.state).toBe('con_cuidado')
    expect(r.tone.toLowerCase()).toContain('acompañarla')
  })
  it('fecha próxima → buen_momento', () => {
    const r = computeContactWindow({ ...base, upcomingEventInDays: 2, upcomingEventLabel: 'su cumple' })
    expect(r.state).toBe('buen_momento')
    expect(r.reason).toContain('cumple')
  })
  it('a la deriva (umbral según importancia) → buen_momento', () => {
    expect(computeContactWindow({ ...base, daysSinceContact: 30 }).state).toBe('buen_momento')
    // alta importancia baja el umbral a 14
    expect(computeContactWindow({ ...base, importance: 9, daysSinceContact: 16 }).state).toBe('buen_momento')
    // misma brecha, baja importancia → todavía neutral (umbral 25)
    expect(computeContactWindow({ ...base, importance: 4, daysSinceContact: 16 }).state).toBe('neutral')
  })
  it('sin señales → neutral', () => {
    expect(computeContactWindow(base).state).toBe('neutral')
  })
})
