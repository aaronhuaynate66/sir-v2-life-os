// SIR V2 — Tests del micro-bid (15·5).

import { describe, it, expect } from 'vitest'
import { suggestMicroBid } from './bid'

describe('suggestMicroBid', () => {
  it('sin señales → null', () => {
    expect(suggestMicroBid({ personName: 'Mica' })).toBeNull()
    expect(suggestMicroBid({ personName: 'Mica', topics: [] })).toBeNull()
  })

  it('prioriza una fecha próxima dentro de la ventana', () => {
    const b = suggestMicroBid({ personName: 'Diana Díaz', upcoming: { label: 'Aniversario', daysUntil: 5 }, topics: ['la mudanza'] })
    expect(b?.kind).toBe('date')
    expect(b?.text).toMatch(/Aniversario de Diana en 5 días/i)
  })

  it('fecha hoy → saludo hoy', () => {
    const b = suggestMicroBid({ personName: 'Tía Marita', upcoming: { label: 'Cumpleaños', daysUntil: 0 } })
    expect(b?.text).toMatch(/hoy es cumpleaños de Tía/i)
  })

  it('fecha fuera de la ventana → cae al tema', () => {
    const b = suggestMicroBid({ personName: 'Alex', upcoming: { label: 'Cumpleaños', daysUntil: 40 }, topics: ['su startup'] })
    expect(b?.kind).toBe('topic')
    expect(b?.text).toMatch(/su startup/i)
  })

  it('sin fecha pero con tema → bid de tema', () => {
    const b = suggestMicroBid({ personName: 'Esteban', topics: ['el examen de su hija', 'fútbol'] })
    expect(b?.kind).toBe('topic')
    expect(b?.text).toMatch(/el examen de su hija/i)
    expect(b?.reason).toBe('tema que le importa')
  })
})
