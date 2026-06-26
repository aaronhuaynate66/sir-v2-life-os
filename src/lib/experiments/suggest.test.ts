import { describe, it, expect } from 'vitest'
import { suggestExperiment, suggestionForGap } from './suggest'
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

  it('gap de conflicto → experimento relacional (escuchar sin defender)', () => {
    const s = suggestExperiment(esp({ gaps: [{ key: 'conflicto_abierto', label: '', observed: '', severity: 'alta' }] }))
    expect(s?.detail.toLowerCase()).toContain('escuchar')
  })
})

describe('suggestionForGap', () => {
  const e = esp({})
  it('gap conocido (sueño) → experimento de sueño', () => {
    expect(suggestionForGap({ key: 'sueño', label: '', observed: '', severity: 'media' }, e).title.toLowerCase()).toContain('medianoche')
  })
  it('gap desconocido → fallback cita el label', () => {
    const s = suggestionForGap({ key: 'otra_cosa', label: 'Algo raro', observed: '', severity: 'leve' }, e)
    expect(s.title).toContain('Algo raro')
    expect(s.detail.length).toBeGreaterThan(0)
  })
})
