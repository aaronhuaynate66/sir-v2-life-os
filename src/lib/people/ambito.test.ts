import { describe, it, expect } from 'vitest'
import { inferAmbito, effectiveAmbito } from './ambito'

describe('inferAmbito', () => {
  it('familia/amigos/pareja → personal', () => {
    expect(inferAmbito('family')).toBe('personal')
    expect(inferAmbito('friend')).toBe('personal')
    expect(inferAmbito('romantic')).toBe('personal')
  })
  it('professional → colega', () => { expect(inferAmbito('professional')).toBe('colega') })
  it('acquaintance → lead', () => { expect(inferAmbito('acquaintance')).toBe('lead') })
})
describe('effectiveAmbito', () => {
  it('respeta el explícito', () => {
    expect(effectiveAmbito({ ambito: 'personal', relationship: 'acquaintance' })).toBe('personal')
  })
  it('cae al inferido si no hay', () => {
    expect(effectiveAmbito({ ambito: undefined, relationship: 'family' })).toBe('personal')
  })
})
