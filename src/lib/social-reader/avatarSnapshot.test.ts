import { describe, expect, it } from 'vitest'

import { unmatchedAvatarPath, UNMATCHED_AVATAR_BUCKET } from './avatarSnapshot'

describe('unmatchedAvatarPath', () => {
  it('vive bajo la carpeta del dueño, subcarpeta unmatched', () => {
    const p = unmatchedAvatarPath('user-123', 'usa_abc')
    expect(p).toBe('user-123/unmatched/usa_abc.jpg')
    expect(p.startsWith('user-123/')).toBe(true)
  })

  it('respeta la extensión pasada', () => {
    expect(unmatchedAvatarPath('u', 'id', 'png')).toBe('u/unmatched/id.png')
    expect(unmatchedAvatarPath('u', 'id', 'webp')).toBe('u/unmatched/id.webp')
  })

  it('el bucket es el de avatares de personas (reutilizado)', () => {
    expect(UNMATCHED_AVATAR_BUCKET).toBe('person-avatars')
  })
})
