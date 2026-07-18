import { describe, it, expect } from 'vitest'
import { deriveSocialSignal } from './derive'

describe('deriveSocialSignal — instagram', () => {
  it('texto con pista de viaje → traveling (el caso Dayana)', () => {
    const s = deriveSocialSignal({ platform: 'instagram', text: 'Una escapadita ✈️', hasActiveStory: true })
    expect(s?.kind).toBe('traveling')
    expect(s?.detail).toContain('escapadita')
  })
  it('varias pistas: aeropuerto/playa/roadtrip', () => {
    expect(deriveSocialSignal({ platform: 'instagram', text: 'en el aeropuerto rumbo a Cusco' })?.kind).toBe('traveling')
    expect(deriveSocialSignal({ platform: 'instagram', text: 'beach day 🏖' })?.kind).toBe('traveling')
    expect(deriveSocialSignal({ platform: 'instagram', text: 'road trip con las chicas' })?.kind).toBe('traveling')
  })
  it('story/post sin pista de viaje → available', () => {
    const s = deriveSocialSignal({ platform: 'instagram', text: 'café de la mañana ☕', hasActiveStory: true })
    expect(s?.kind).toBe('available')
    expect(s?.detail).toContain('café')
  })
  it('story activa sin texto → available sin detalle', () => {
    expect(deriveSocialSignal({ platform: 'instagram', hasActiveStory: true })).toEqual({ kind: 'available', detail: null })
  })
  it('sin story ni texto → null (no inventa)', () => {
    expect(deriveSocialSignal({ platform: 'instagram' })).toBeNull()
  })
  it('recorta el detalle largo', () => {
    const long = 'x '.repeat(120)
    const s = deriveSocialSignal({ platform: 'instagram', text: long })
    expect((s?.detail ?? '').length).toBeLessThanOrEqual(90)
  })
})

describe('deriveSocialSignal — linkedin', () => {
  it('headline cambió → job_change con el nuevo headline', () => {
    const s = deriveSocialSignal({ platform: 'linkedin', headline: 'COO en OpenMed', priorHeadline: 'Gerente en Jhodaal' })
    expect(s?.kind).toBe('job_change')
    expect(s?.detail).toContain('OpenMed')
  })
  it('mismo headline (case/espacios) → null', () => {
    expect(deriveSocialSignal({ platform: 'linkedin', headline: 'COO  en  OpenMed', priorHeadline: 'coo en openmed' })).toBeNull()
  })
  it('sin headline previo → null (no sabemos si cambió)', () => {
    expect(deriveSocialSignal({ platform: 'linkedin', headline: 'COO en OpenMed' })).toBeNull()
  })
})
