// SIR V2 — Tests de la lectura tipada de observations de perfil.
//
// LIVE: PerfilProfesional / RedesSociales / VidaProfesional / VidaSocial
// rinden estos valores. La coerción es DEFENSIVA contra `data` jsonb opaco
// (rows viejas, extracción parcial): un regression silencioso metería basura
// en la UI (números string, strings vacíos, objetos a medias).

import { describe, it, expect } from 'vitest'

import type { Observation } from '@/lib/capture/observations/types'
import { latestOfType, readLinkedIn, readInstagram, professionalSummary, fmtCount } from './profile'

function obs(id: string, captureType: Observation['captureType']): Observation {
  return { id, captureType } as Observation
}

describe('latestOfType', () => {
  it('devuelve el primer match del tipo (asume orden DESC)', () => {
    const list = [obs('a', 'instagram'), obs('b', 'linkedin'), obs('c', 'linkedin')]
    expect(latestOfType(list, 'linkedin')?.id).toBe('b')
  })
  it('sin match → null', () => {
    expect(latestOfType([obs('a', 'instagram')], 'linkedin')).toBeNull()
  })
})

describe('readLinkedIn — coerción defensiva', () => {
  it('campos válidos pasan; tipos incorrectos se neutralizan', () => {
    const r = readLinkedIn({
      fullName: 'Ana Díaz',
      headline: '   ', // whitespace-only → null
      currentRole: 'Engineer',
      connectionsCount: 500,
      isOpenToWork: true,
      hasProfilePhoto: 'yes', // no es boolean true → false
      latestExperience: { name: 'Acme', title: 'Eng', dateRange: '2020-2024' },
    })
    expect(r.fullName).toBe('Ana Díaz')
    expect(r.headline).toBeNull()
    expect(r.currentRole).toBe('Engineer')
    expect(r.connectionsCount).toBe(500)
    expect(r.isOpenToWork).toBe(true)
    expect(r.hasProfilePhoto).toBe(false)
    expect(r.latestExperience).toEqual({ name: 'Acme', title: 'Eng', dateRange: '2020-2024' })
  })

  it('número como string → null; orgRef sin name → null', () => {
    const r = readLinkedIn({
      connectionsCount: '500', // string, no number
      latestEducation: { title: 'BSc' }, // sin name → null
    })
    expect(r.connectionsCount).toBeNull()
    expect(r.latestEducation).toBeNull()
  })

  it('NaN/Infinity no son números válidos', () => {
    expect(readLinkedIn({ connectionsCount: NaN }).connectionsCount).toBeNull()
    expect(readLinkedIn({ connectionsCount: Infinity }).connectionsCount).toBeNull()
  })
})

describe('readInstagram — coerción defensiva', () => {
  it('handle vacío → undefined; counts válidos; flags solo true', () => {
    const r = readInstagram({
      handle: '',
      followersCount: 1200,
      isVerified: true,
      isPrivate: 1, // truthy pero no === true → false
    })
    expect(r.handle).toBeUndefined()
    expect(r.followersCount).toBe(1200)
    expect(r.isVerified).toBe(true)
    expect(r.isPrivate).toBe(false)
  })
})

describe('professionalSummary', () => {
  it('rol + empresa → "Rol en Empresa"', () => {
    expect(professionalSummary({ currentRole: 'Engineer', currentCompany: 'Acme' })).toBe('Engineer en Acme')
  })
  it('agrega educación (con título · institución)', () => {
    expect(
      professionalSummary({
        currentRole: 'Engineer',
        currentCompany: 'Acme',
        latestEducation: { name: 'MIT', title: 'BSc', dateRange: null },
      }),
    ).toBe('Engineer en Acme · BSc · MIT')
  })
  it('solo headline cuando no hay rol', () => {
    expect(professionalSummary({ headline: 'Builder of things' })).toBe('Builder of things')
  })
  it('sin material suficiente → null', () => {
    expect(professionalSummary({})).toBeNull()
  })
})

describe('fmtCount', () => {
  it('null/undefined → "—"', () => {
    expect(fmtCount(null)).toBe('—')
    expect(fmtCount(undefined)).toBe('—')
  })
  it('0 es un número válido (no "—")', () => {
    expect(fmtCount(0)).toBe('0')
  })
  it('número pequeño se renderiza sin agrupar', () => {
    expect(fmtCount(500)).toBe('500')
  })
})
