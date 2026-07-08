import { describe, it, expect } from 'vitest'

import { fichaArchetype, fichaProfile } from './fichaProfile'
import type { Person } from '@/types'

const base = (over: Partial<Person>): Pick<Person, 'relationship' | 'ambito' | 'gender' | 'cycleStartDate'> => ({
  relationship: 'friend', ambito: undefined, gender: undefined, cycleStartDate: undefined, ...over,
})

describe('fichaArchetype', () => {
  it('romantic → afectivo', () => expect(fichaArchetype(base({ relationship: 'romantic' }))).toBe('afectivo'))
  it('family → familiar', () => expect(fichaArchetype(base({ relationship: 'family' }))).toBe('familiar'))
  it('friend → personal', () => expect(fichaArchetype(base({ relationship: 'friend' }))).toBe('personal'))
  it('professional → colega (ámbito inferido)', () => expect(fichaArchetype(base({ relationship: 'professional' }))).toBe('colega'))
  it('acquaintance → lead (ámbito inferido)', () => expect(fichaArchetype(base({ relationship: 'acquaintance' }))).toBe('lead'))
  it('ámbito explícito pisa la inferencia', () => expect(fichaArchetype(base({ relationship: 'friend', ambito: 'lead' }))).toBe('lead'))
})

describe('fichaProfile — Cuidado solo afectivo', () => {
  it('pareja mujer → muestra Cuidado', () => {
    expect(fichaProfile(base({ relationship: 'romantic', gender: 'female' })).showCuidado).toBe(true)
  })
  it('colega mujer → NO muestra Cuidado (el bug que arreglamos: Diana Cencaro)', () => {
    expect(fichaProfile(base({ relationship: 'professional', gender: 'female' })).showCuidado).toBe(false)
  })
  it('pareja sin ciclo ni género → no muestra Cuidado', () => {
    expect(fichaProfile(base({ relationship: 'romantic' })).showCuidado).toBe(false)
  })
})

describe('fichaProfile — Comercial colega + lead', () => {
  it('lead → comercial', () => expect(fichaProfile(base({ relationship: 'acquaintance' })).showCommercial).toBe(true))
  it('colega → comercial', () => expect(fichaProfile(base({ relationship: 'professional' })).showCommercial).toBe(true))
  it('pareja → NO comercial', () => expect(fichaProfile(base({ relationship: 'romantic' })).showCommercial).toBe(false))
  it('amigo → NO comercial', () => expect(fichaProfile(base({ relationship: 'friend' })).showCommercial).toBe(false))
})
