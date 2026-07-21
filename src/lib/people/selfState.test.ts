import { describe, it, expect } from 'vitest'
import { selfStateGate } from './selfState'
import type { SelfBioState } from './selfState'

const s = (state: SelfBioState['window']['state']): SelfBioState => ({
  window: { state, stressElevated: false, hrvDown: false, sleepLow: false } as SelfBioState['window'],
  sleepDebtHours: null,
  block: null,
})

describe('selfStateGate', () => {
  it('ventana ANGOSTA → aviso fuerte de regular antes de negociar', () => {
    expect(selfStateGate(s('narrow'))).toMatch(/fuera de tu ventana/i)
  })
  it('ventana tensionada → aviso suave', () => {
    expect(selfStateGate(s('watch'))).toMatch(/tensionada/i)
  })
  it('abierta / sin data → sin aviso', () => {
    expect(selfStateGate(s('open'))).toBeNull()
    expect(selfStateGate(s('insufficient'))).toBeNull()
  })
})
