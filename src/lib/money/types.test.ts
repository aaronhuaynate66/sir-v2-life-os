import { describe, it, expect } from 'vitest'
import { summarizeMoney, type MoneyEntry } from './types'
const e = (direction: 'out' | 'in', amount: number): MoneyEntry => ({ id: Math.random().toString(), personId: 'd', direction, amount, currency: 'PEN', concept: null, kind: 'transfer', occurredOn: null, occurredTime: null, opRef: null, settled: false })
describe('summarizeMoney', () => {
  it('suma out, in y neto', () => {
    const s = summarizeMoney([e('out', 350), e('out', 100), e('out', 1), e('in', 150)])
    expect(s.out).toBe(451); expect(s.in).toBe(150); expect(s.net).toBe(301); expect(s.count).toBe(4)
  })
  it('separa por moneda', () => {
    const usd: MoneyEntry = { ...e('out', 68), currency: 'USD' }
    const s = summarizeMoney([e('out', 20), usd], 'PEN')
    expect(s.out).toBe(20); expect(s.count).toBe(1)
  })
})
