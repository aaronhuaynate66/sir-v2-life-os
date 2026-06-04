import { describe, it, expect } from 'vitest'
import { buildCaptureProposal } from './applyCapture'
import { emptyIdentityProfile, type IdentityProfile } from './index'
import type { SelfProfileExtracted } from '@/lib/capture/self-profile/types'

function profile(over: Partial<IdentityProfile>): IdentityProfile {
  return { ...emptyIdentityProfile('idn_1'), ...over }
}
function ex(over: Partial<SelfProfileExtracted>): SelfProfileExtracted {
  return {
    source: 'linkedin',
    fullName: null,
    birthDate: null,
    roles: [],
    location: null,
    skills: [],
    interests: [],
    bio: null,
    trajectory: null,
    imageLegible: true,
    confidence: 'high',
    rawObservations: null,
    ...over,
  }
}

describe('buildCaptureProposal', () => {
  it('mergea roles sin duplicar y reporta los nuevos', () => {
    const existing = profile({ roles: ['Bombero'] })
    const { proposed, diff } = buildCaptureProposal(
      existing,
      ex({ roles: ['bombero', 'Fundador de Marlab'] }),
    )
    expect(proposed.roles).toEqual(['Bombero', 'Fundador de Marlab'])
    expect(diff.addedRoles).toEqual(['Fundador de Marlab'])
  })

  it('pliega los skills de LinkedIn dentro de interests', () => {
    const { proposed } = buildCaptureProposal(
      profile({}),
      ex({ interests: ['Fotografía'], skills: ['Liderazgo', 'Ventas'] }),
    )
    expect(proposed.interests).toEqual(['Fotografía', 'Liderazgo', 'Ventas'])
  })

  it('RELLENA campos vacíos pero NUNCA pisa lo escrito a mano', () => {
    const existing = profile({ fullName: 'Aaron H.', location: '' })
    const { proposed, diff } = buildCaptureProposal(
      existing,
      ex({ fullName: 'Aaron Huaynate Full', location: 'Lima, Perú' }),
    )
    // fullName ya estaba → se respeta. location vacío → se rellena.
    expect(proposed.fullName).toBe('Aaron H.')
    expect(proposed.location).toBe('Lima, Perú')
    expect(diff.filled).toEqual([{ field: 'location', value: 'Lima, Perú' }])
  })

  it('no toca specialDates, ni pisa un birthDate existente', () => {
    const existing = profile({
      birthDate: '1990-05-30',
      specialDates: [{ id: 'sd1', label: 'Aniversario', date: '2018-09-12', recurring: true }],
    })
    // Aunque el relato traiga otra fecha, NO pisa la que ya estaba.
    const { proposed } = buildCaptureProposal(existing, ex({ birthDate: '1985-01-01', roles: ['Atleta'] }))
    expect(proposed.birthDate).toBe('1990-05-30')
    expect(proposed.specialDates).toHaveLength(1)
  })

  it('rellena birthDate cuando no había, y lo reporta en filled', () => {
    const { proposed, diff } = buildCaptureProposal(
      profile({ birthDate: null }),
      ex({ birthDate: '1990-05-30' }),
    )
    expect(proposed.birthDate).toBe('1990-05-30')
    expect(diff.filled).toContainEqual({ field: 'birthDate', value: '1990-05-30' })
  })

  it('hasChanges=false cuando la captura no aporta nada nuevo', () => {
    const existing = profile({ roles: ['Bombero'], fullName: 'Aaron', location: 'Lima' })
    const { hasChanges } = buildCaptureProposal(existing, ex({ roles: ['bombero'] }))
    expect(hasChanges).toBe(false)
  })
})
