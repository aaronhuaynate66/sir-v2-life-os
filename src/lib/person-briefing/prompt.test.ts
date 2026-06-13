import { describe, it, expect } from 'vitest'
import { buildBriefingInput, BRIEFING_SYSTEM_PROMPT, type BriefingMemory, type BriefingSelfStat } from './prompt'

const facts = { name: 'Alex', relationship: 'colega', category: 'trabajo' }
const mems: BriefingMemory[] = [
  { type: 'episodic', content: 'reunión de growth tensa', timestamp: '2026-06-12T10:00:00Z' },
]

describe('BRIEFING_SYSTEM_PROMPT — guardas de la Oportunidad', () => {
  it('cierra en Oportunidad hacia adelante, no causalidad', () => {
    expect(BRIEFING_SYSTEM_PROMPT).toContain('Oportunidad:')
    expect(BRIEFING_SYSTEM_PROMPT).toMatch(/hacia adelante|ADELANTE/)
    expect(BRIEFING_SYSTEM_PROMPT).toContain('límite')
    expect(BRIEFING_SYSTEM_PROMPT.toLowerCase()).toContain('manipulación')
  })
})

describe('buildBriefingInput', () => {
  it('incluye memorias y funciona sin estado propio', () => {
    const out = buildBriefingInput(facts, mems)
    expect(out).toContain('Memorias asociadas (1')
    expect(out).toContain('reunión de growth tensa')
    expect(out).not.toContain('Tu estado reciente')
  })

  it('inserta el estado propio relevante (calibra timing/tono)', () => {
    const self: BriefingSelfStat[] = [
      { kind: 'energy', avg: 2.0, count: 3 },
      { kind: 'sleep', avg: 2.5, count: 2 },
    ]
    const out = buildBriefingInput(facts, mems, self)
    expect(out).toContain('Tu estado reciente')
    expect(out).toContain('energía: 2.0/5')
    expect(out).toContain('sueño: 2.5/5')
    expect(out).toContain('NO como causa')
  })

  it('ignora kinds no relevantes o con count 0', () => {
    const self: BriefingSelfStat[] = [
      { kind: 'interaction', avg: 1, count: 5 },
      { kind: 'mood', avg: 3, count: 0 },
    ]
    const out = buildBriefingInput(facts, mems, self)
    expect(out).not.toContain('Tu estado reciente')
  })
})
