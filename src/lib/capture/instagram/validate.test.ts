import { describe, it, expect } from 'vitest'

import {
  isValidInstagramProfileExtracted,
  sanitizeInstagramProfile,
} from './validate'
import type { InstagramProfileExtracted } from './types'

function base(): InstagramProfileExtracted {
  return {
    handle: 'diana.carolina.d',
    displayName: 'Diana',
    bio: null,
    externalLink: null,
    pronouns: null,
    category: null,
    postsCount: 10,
    followersCount: 500,
    followingCount: 300,
    isVerified: false,
    isPrivate: false,
    hasProfilePhoto: true,
    mutualFollowersText: null,
    mutualFollowers: null,
    confidence: 'high',
    rawObservations: null,
  }
}

describe('isValidInstagramProfileExtracted', () => {
  it('acepta un objeto válido', () => {
    expect(isValidInstagramProfileExtracted(base())).toBe(true)
  })

  it('tolera mutualFollowersText ausente (el modelo lo omite)', () => {
    const o = base() as Record<string, unknown>
    delete o.mutualFollowersText
    expect(isValidInstagramProfileExtracted(o)).toBe(true)
  })

  it('rechaza mutualFollowersText con tipo inválido', () => {
    const o = base() as Record<string, unknown>
    o.mutualFollowersText = 42
    expect(isValidInstagramProfileExtracted(o)).toBe(false)
  })
})

describe('sanitizeInstagramProfile — seguidores en común', () => {
  it('parsea la línea literal a estructura (ejemplo Diana)', () => {
    const raw = base()
    raw.mutualFollowersText = 'its_almendrita, adrian.prog y 12 más siguen esta cuenta'
    const out = sanitizeInstagramProfile(raw)
    expect(out.mutualFollowersText).toBe('its_almendrita, adrian.prog y 12 más siguen esta cuenta')
    expect(out.mutualFollowers).toEqual({
      named: ['its_almendrita', 'adrian.prog'],
      totalCount: 14,
    })
  })

  it('línea ausente → mutualFollowers null (datos insuficientes)', () => {
    const out = sanitizeInstagramProfile(base())
    expect(out.mutualFollowersText).toBeNull()
    expect(out.mutualFollowers).toBeNull()
  })

  it('no rompe si Vision omitió el campo (undefined → null)', () => {
    const raw = base() as InstagramProfileExtracted
    // @ts-expect-error simulamos una respuesta vieja sin el campo
    delete raw.mutualFollowersText
    const out = sanitizeInstagramProfile(raw)
    expect(out.mutualFollowersText).toBeNull()
    expect(out.mutualFollowers).toBeNull()
  })
})
