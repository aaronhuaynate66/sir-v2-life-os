import { describe, it, expect } from 'vitest'
import { summarizeMoney, type MoneyEntry } from './types'
const e = (direction: 'out' | 'in', amount: number, settled = false): MoneyEntry => ({ id: Math.random().toString(), personId: 'd', direction, amount, currency: 'PEN', concept: null, kind: 'transfer', occurredOn: null, occurredTime: null, opRef: null, settled })
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
  it('rescate DD: pending ignora lo saldado; net sigue contando todo', () => {
    // Le pasaste 300 (saldado) + 100 (pendiente). Net=400, pendiente=100.
    const s = summarizeMoney([e('out', 300, true), e('out', 100, false)])
    expect(s.net).toBe(400)
    expect(s.pending).toBe(100)
    expect(s.hasSettled).toBe(true)
  })
  it('sin nada saldado, pending = net y hasSettled false', () => {
    const s = summarizeMoney([e('out', 200), e('in', 50)])
    expect(s.pending).toBe(150)
    expect(s.net).toBe(150)
    expect(s.hasSettled).toBe(false)
  })
})
