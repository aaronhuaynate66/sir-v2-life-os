// SIR V2 — Tests de aprender qué regulación funciona (13·M4).

import { describe, it, expect } from 'vitest'
import { summarizeRegulation, type RegulationLog, type Helped } from './learning'

let n = 0
function log(strategy: string, helped: Helped | null): RegulationLog {
  return { id: `l${n++}`, strategy, helped, appliedAt: '2026-06-01T00:00:00Z' }
}

describe('summarizeRegulation', () => {
  it('sin calificaciones suficientes → sin insight', () => {
    const r = summarizeRegulation([log('reappraisal', 'yes'), log('reappraisal', null)])
    expect(r.insight).toBeNull()
  })

  it('afirma la que más te ayuda cuando hay ≥3 calificadas y diferencia clara', () => {
    const logs = [
      log('reappraisal', 'yes'), log('reappraisal', 'yes'), log('reappraisal', 'yes'),
      log('response_modulation', 'no'), log('response_modulation', 'no'), log('response_modulation', 'somewhat'),
    ]
    const r = summarizeRegulation(logs)
    expect(r.best?.strategy).toBe('reappraisal')
    expect(r.insight).toMatch(/reencuadrar suele ayudar más/i)
  })

  it('ignora los registros sin calificar en el rate', () => {
    const logs = [
      log('reappraisal', 'yes'), log('reappraisal', 'yes'), log('reappraisal', 'no'), log('reappraisal', null),
    ]
    const r = summarizeRegulation(logs)
    const s = r.stats.find((x) => x.strategy === 'reappraisal')!
    expect(s.rated).toBe(3)
    expect(s.helpRate).toBeCloseTo(2 / 3, 2)
  })

  it('una sola estrategia con buena tasa → insight de refuerzo', () => {
    const logs = [log('response_modulation', 'yes'), log('response_modulation', 'yes'), log('response_modulation', 'somewhat')]
    const r = summarizeRegulation(logs)
    expect(r.insight).toMatch(/bajar la activación viene funcionando/i)
  })
})
