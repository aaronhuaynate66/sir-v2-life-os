// SIR V2 — Tests 12·M1: prompt atado a la franja.

import { describe, it, expect } from 'vitest'
import { activeSlotPrompt, type SlotTask } from './activeSlot'

// Helper: ms UTC para una hora de pared de Lima (UTC-5) en una fecha dada.
function limaMs(date: string, hh: number, mm: number): number {
  return Date.parse(`${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00-05:00`)
}

const DATE = '2026-07-06'
function task(over: Partial<SlotTask>): SlotTask {
  return { id: 't', title: 'Meditar 10 min', targetDate: DATE, dueTime: '07:00', effort: 'S', done: false, ...over }
}

describe('activeSlotPrompt', () => {
  it('dentro de la franja (justo a la hora) → "Ahora: ..."', () => {
    const now = limaMs(DATE, 7, 5) // 5 min después de las 7:00
    const p = activeSlotPrompt([task({})], now)
    expect(p).not.toBeNull()
    expect(p!.imminent).toBe(false)
    expect(p!.text).toMatch(/^Ahora: Meditar 10 min · esfuerzo S/)
  })

  it('unos minutos antes (dentro del lead) → "En breve ..."', () => {
    const now = limaMs(DATE, 6, 53) // 7 min antes
    const p = activeSlotPrompt([task({})], now)
    expect(p).not.toBeNull()
    expect(p!.imminent).toBe(true)
    expect(p!.text).toMatch(/^En breve \(07:00\): Meditar/)
  })

  it('demasiado antes (fuera del lead) → null', () => {
    const now = limaMs(DATE, 6, 30) // 30 min antes
    expect(activeSlotPrompt([task({})], now)).toBeNull()
  })

  it('pasada la ventana (>60 min después) → null', () => {
    const now = limaMs(DATE, 8, 30) // 90 min después
    expect(activeSlotPrompt([task({})], now)).toBeNull()
  })

  it('tarea ya hecha → no aparece', () => {
    const now = limaMs(DATE, 7, 5)
    expect(activeSlotPrompt([task({ done: true })], now)).toBeNull()
  })

  it('otra fecha → no aparece', () => {
    const now = limaMs(DATE, 7, 5)
    expect(activeSlotPrompt([task({ targetDate: '2026-07-07' })], now)).toBeNull()
  })

  it('con varias activas, elige la más cercana al momento', () => {
    const now = limaMs(DATE, 7, 2)
    const tasks = [
      task({ id: 'a', title: 'Lejana', dueTime: '07:40' }),
      task({ id: 'b', title: 'Cercana', dueTime: '07:00' }),
    ]
    const p = activeSlotPrompt(tasks, now)
    expect(p!.taskId).toBe('b')
  })

  it('sin dueTime → no aparece', () => {
    const now = limaMs(DATE, 7, 5)
    expect(activeSlotPrompt([task({ dueTime: undefined })], now)).toBeNull()
  })
})
