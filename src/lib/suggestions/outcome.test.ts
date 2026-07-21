import { describe, it, expect } from 'vitest'
import { contactWasFollowed, contactSuggestionSeed } from './outcome'

describe('contactWasFollowed', () => {
  const since = '2026-07-20T10:00:00Z'
  it('true si hay una interacción posterior a la sugerencia', () => {
    expect(contactWasFollowed(since, ['2026-07-21T09:00:00Z'])).toBe(true)
  })
  it('false si la interacción es ANTERIOR', () => {
    expect(contactWasFollowed(since, ['2026-07-19T09:00:00Z'])).toBe(false)
  })
  it('cuenta la interacción casi simultánea (margen 60s)', () => {
    expect(contactWasFollowed(since, ['2026-07-20T09:59:30Z'])).toBe(true)
  })
  it('ignora timestamps nulos/basura y false si no hay ninguno válido', () => {
    expect(contactWasFollowed(since, [null, undefined, 'basura'])).toBe(false)
  })
  it('false si since no parsea', () => {
    expect(contactWasFollowed('x', ['2026-07-21T09:00:00Z'])).toBe(false)
  })
})

describe('contactSuggestionSeed', () => {
  it('es estable por (user, persona, día)', () => {
    expect(contactSuggestionSeed('u1', 'p1', '2026-07-21')).toBe('u1|contact|p1|2026-07-21')
    expect(contactSuggestionSeed('u1', 'p1', '2026-07-21')).toBe(contactSuggestionSeed('u1', 'p1', '2026-07-21'))
    expect(contactSuggestionSeed('u1', 'p1', '2026-07-22')).not.toBe(contactSuggestionSeed('u1', 'p1', '2026-07-21'))
  })
})
