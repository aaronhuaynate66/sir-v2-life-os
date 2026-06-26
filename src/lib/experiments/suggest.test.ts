import { describe, it, expect } from 'vitest'
import { suggestExperiment } from './suggest'
import type { EspejoSemanal } from '@/lib/self/espejoSemanal'

function esp(p: Partial<EspejoSemanal>): EspejoSemanal {
  return { state: 'a_la_deriva', headline: '', norteTitle: 'Mundial', gaps: [], wins: [], windowDays: 7, ...p }
}

describe('suggestExperiment', () => {
  it('sin datos → null', () => {
    expect(suggestExperiment(esp({ state: 'sin_datos' }))).toBeNull()
  })
  it('sin norte → propone fijar el norte', () => {
    const s = suggestExperiment(esp({ state: 'sin_norte', norteTitle: null }))
    expect(s?.title.toLowerCase()).toContain('norte')
  })
  it('gap de norte → experimento de un paso al norte (cita el norte)', () => {
    const s = suggestExperiment(esp({ gaps: [{ key: 'norte', label: '', observed: '', severity: 'alta' }] }))
    expect(s?.title).toContain('Mundial')
  })
  it('elige la brecha más severa entre varias', () => {
    const s = suggestExperiment(esp({ gaps: [
      { key: 'sueño', label: '', observed: '', severity: 'media' },
      { key: 'norte', label: '', observed: '', severity: 'alta' },
    ] }))
    expect(s?.title).toContain('Mundial') // norte (alta) gana sobre sueño (media)
  })
  it('solo gap de sueño → experimento de sueño', () => {
    const s = suggestExperiment(esp({ gaps: [{ key: 'sueño', label: '', observed: '', severity: 'media' }] }))
    expect(s?.title.toLowerCase()).toContain('medianoche')
  })
  it('alineado sin gaps → sostener lo que funciona', () => {
    const s = suggestExperiment(esp({ state: 'alineado', gaps: [] }))
    expect(s?.title.toLowerCase()).toContain('sostené')
  })
})
