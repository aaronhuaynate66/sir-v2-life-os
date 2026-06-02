import { describe, it, expect } from 'vitest'

import { buildPersonSummary } from './personSummary'
import type { Person } from '@/types'

const NOW = new Date('2026-06-01T12:00:00Z')

function person(over: Partial<Person> = {}): Person {
  return {
    id: 'p1',
    name: 'Diana Carolina',
    relationship: 'romantic',
    category: 'close',
    importanceScore: 5,
    energyImpact: 'neutral',
    trustLevel: 5,
    contactFrequency: '',
    tags: [],
    notes: '',
    ...over,
  } as Person
}

describe('buildPersonSummary — ciclo', () => {
  it('expone fase + días al próximo período cuando la persona lo trackea', () => {
    const s = buildPersonSummary(
      { person: person({ cycleStartDate: '2026-05-28', cycleLengthDays: 28 }), lastChatObservedAt: null, lastManualInteractionAt: null },
      NOW,
    )
    expect(s.cycle).not.toBeNull()
    expect(s.cycle!.label).toBe('Menstrual') // día 5 = aún menstrual (días 1-5)
    expect(s.cycle!.cycleDay).toBe(5)
  })

  it('sin cycleStartDate → cycle null', () => {
    const s = buildPersonSummary({ person: person(), lastChatObservedAt: null, lastManualInteractionAt: null }, NOW)
    expect(s.cycle).toBeNull()
  })
})

describe('buildPersonSummary — próxima fecha', () => {
  it('detecta cumpleaños próximo con nudge', () => {
    const s = buildPersonSummary(
      { person: person({ birthDate: '1995-06-13' }), lastChatObservedAt: null, lastManualInteractionAt: null },
      NOW,
    )
    expect(s.nextDate).not.toBeNull()
    expect(s.nextDate!.kind).toBe('birthday')
    expect(s.nextDate!.daysUntil).toBe(12)
    expect(s.nextDate!.nudge.length).toBeGreaterThan(0)
  })

  it('cumpleaños lejano (>60d) no aparece en la franja', () => {
    const s = buildPersonSummary(
      { person: person({ birthDate: '1995-12-25' }), lastChatObservedAt: null, lastManualInteractionAt: null },
      NOW,
    )
    expect(s.nextDate).toBeNull()
  })
})

describe('buildPersonSummary — última interacción', () => {
  it('toma la más reciente entre chat y registro manual', () => {
    const s = buildPersonSummary(
      {
        person: person(),
        lastChatObservedAt: '2026-05-20T12:00:00Z',
        lastManualInteractionAt: '2026-05-30T12:00:00Z',
      },
      NOW,
    )
    expect(s.lastInteraction).not.toBeNull()
    expect(s.lastInteraction!.iso).toBe('2026-05-30T12:00:00Z')
    expect(s.lastInteraction!.days).toBe(2)
    expect(s.lastInteraction!.relative).toContain('2')
  })

  it('sin ninguna interacción → null', () => {
    const s = buildPersonSummary({ person: person(), lastChatObservedAt: null, lastManualInteractionAt: null }, NOW)
    expect(s.lastInteraction).toBeNull()
  })
})

describe('buildPersonSummary — próxima acción', () => {
  it('prioriza cumpleaños próximo sobre contacto frío', () => {
    const s = buildPersonSummary(
      {
        person: person({ birthDate: '1995-06-10', importanceScore: 9 }),
        lastChatObservedAt: '2026-01-01T12:00:00Z', // muy viejo
        lastManualInteractionAt: null,
      },
      NOW,
    )
    expect(s.nextAction).not.toBeNull()
    expect(s.nextAction!.text.toLowerCase()).toContain('cumple')
    expect(s.nextAction!.urgency).toBe('soon') // 9 días
  })

  it('contacto frío cuando no hay fecha próxima (umbral según importancia)', () => {
    const s = buildPersonSummary(
      {
        person: person({ importanceScore: 10 }), // umbral 7d
        lastChatObservedAt: '2026-05-20T12:00:00Z', // hace 12 días
        lastManualInteractionAt: null,
      },
      NOW,
    )
    expect(s.nextAction).not.toBeNull()
    expect(s.nextAction!.text).toContain('sin hablar')
  })

  it('vínculo al día (poco importante, interacción reciente) → sin acción', () => {
    const s = buildPersonSummary(
      {
        person: person({ importanceScore: 2 }), // umbral ~21d
        lastChatObservedAt: '2026-05-28T12:00:00Z', // hace 4 días
        lastManualInteractionAt: null,
      },
      NOW,
    )
    expect(s.nextAction).toBeNull()
  })

  it('sin contacto ni último contacto manual → sugiere registrar', () => {
    const s = buildPersonSummary({ person: person(), lastChatObservedAt: null, lastManualInteractionAt: null }, NOW)
    expect(s.nextAction).not.toBeNull()
    expect(s.nextAction!.text.toLowerCase()).toContain('registr')
    expect(s.nextAction!.urgency).toBe('info')
  })

  it('cumpleaños hoy → urgencia now', () => {
    const s = buildPersonSummary(
      { person: person({ birthDate: '1995-06-01' }), lastChatObservedAt: null, lastManualInteractionAt: null },
      NOW,
    )
    expect(s.nextAction!.urgency).toBe('now')
    expect(s.nextAction!.text.toLowerCase()).toContain('hoy')
  })
})

describe('buildPersonSummary — score', () => {
  it('siempre devuelve score con banda', () => {
    const s = buildPersonSummary({ person: person(), lastChatObservedAt: null, lastManualInteractionAt: null }, NOW)
    expect(s.score.global).toBe(45)
    expect(s.score.band.id).toBe('care')
  })
})
