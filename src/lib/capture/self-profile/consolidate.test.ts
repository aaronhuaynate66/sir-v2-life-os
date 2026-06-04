import { describe, it, expect } from 'vitest'
import { consolidateSelfProfiles } from './consolidate'
import type { SelfProfileExtracted } from './types'

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
    imageLegible: false,
    confidence: 'low',
    rawObservations: null,
    ...over,
  }
}

describe('consolidateSelfProfiles', () => {
  it('lista vacía → null', () => {
    expect(consolidateSelfProfiles([])).toBeNull()
  })

  it('un solo item se devuelve tal cual', () => {
    const a = ex({ fullName: 'Aaron', roles: ['Bombero'] })
    expect(consolidateSelfProfiles([a])).toBe(a)
  })

  it('une tags deduplicando case-insensitive', () => {
    const a = ex({ roles: ['Bombero', 'Fundador'], interests: ['Taekwondo'] })
    const b = ex({ roles: ['bombero', 'Atleta'], interests: ['taekwondo', 'Fotografía'] })
    const merged = consolidateSelfProfiles([a, b])!
    expect(merged.roles).toEqual(['Bombero', 'Fundador', 'Atleta'])
    expect(merged.interests).toEqual(['Taekwondo', 'Fotografía'])
  })

  it('textos: gana el más largo (más completo)', () => {
    const a = ex({ bio: 'Bombero', location: 'Lima' })
    const b = ex({ bio: 'Bombero voluntario y fundador', location: 'Lima, Perú' })
    const merged = consolidateSelfProfiles([a, b])!
    expect(merged.bio).toBe('Bombero voluntario y fundador')
    expect(merged.location).toBe('Lima, Perú')
  })

  it('confidence: la más alta presente; imageLegible: OR', () => {
    const a = ex({ confidence: 'low', imageLegible: false })
    const b = ex({ confidence: 'high', imageLegible: true })
    const merged = consolidateSelfProfiles([a, b])!
    expect(merged.confidence).toBe('high')
    expect(merged.imageLegible).toBe(true)
  })

  it('birthDate: toma el primer no-nulo', () => {
    const merged = consolidateSelfProfiles([
      ex({ birthDate: null }),
      ex({ birthDate: '1990-05-30' }),
      ex({ birthDate: '1991-01-01' }),
    ])!
    expect(merged.birthDate).toBe('1990-05-30')
  })

  it('source: la red mayoritaria no-unknown', () => {
    const merged = consolidateSelfProfiles([
      ex({ source: 'instagram' }),
      ex({ source: 'instagram' }),
      ex({ source: 'linkedin' }),
      ex({ source: 'unknown' }),
    ])!
    expect(merged.source).toBe('instagram')
  })
})
