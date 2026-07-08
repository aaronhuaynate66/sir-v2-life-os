import { describe, it, expect } from 'vitest'

import { synthesisCue } from './horizonCue'
import { cyclePhase } from './phase'

// Ciclo de 28 días arrancando 2026-06-01. Construimos fases reales con
// cyclePhase y verificamos el mapeo a la síntesis (mejor momento / cuidado).
const START = '2026-06-01'

function cueOn(dayIso: string) {
  const cp = cyclePhase(START, 28, new Date(`${dayIso}T12:00:00`))
  if (!cp) throw new Error('cyclePhase null')
  return synthesisCue(cp)
}

describe('synthesisCue — mapeo fase → mensaje/tono', () => {
  it('menstrual (día 2) → cuidado', () => {
    expect(cueOn('2026-06-02').tone).toBe('care')
  })

  it('folicular/ovulación (día ~13) → buen momento', () => {
    expect(cueOn('2026-06-13').tone).toBe('good')
  })

  it('lútea media (día ~20, sin PMS) → neutral', () => {
    expect(cueOn('2026-06-20').tone).toBe('neutral')
  })

  it('lútea tardía / PMS (día ~27) → cuidado', () => {
    expect(cueOn('2026-06-27').tone).toBe('care')
  })

  it('siempre devuelve un texto no vacío', () => {
    for (const d of ['2026-06-02', '2026-06-13', '2026-06-20', '2026-06-27']) {
      expect(cueOn(d).text.length).toBeGreaterThan(0)
    }
  })
})
