import { describe, it, expect } from 'vitest'
import { relationshipMilestones, mergeLifeThread, buildLifeThread } from './lifeThread'

describe('relationshipMilestones', () => {
  it('mapea quiebres a hitos (creció/enfrió)', () => {
    const ms = relationshipMilestones('Diana', [
      { date: '2026-06-10', direction: 'up', from: 45, to: 75, delta: 30, spanDays: 5, label: 'x' },
      { date: '2026-05-01', direction: 'down', from: 80, to: 60, delta: -20, spanDays: 3, label: 'y' },
    ])
    expect(ms).toHaveLength(2)
    expect(ms[0].kind).toBe('bond_rise')
    expect(ms[0].label).toContain('Diana creció')
    expect(ms[1].kind).toBe('bond_drop')
    expect(ms[1].label).toContain('se enfrió')
  })
})

describe('mergeLifeThread', () => {
  it('une y ordena por fecha desc', () => {
    const a = relationshipMilestones('X', [{ date: '2026-06-10', direction: 'up', from: 1, to: 9, delta: 8, spanDays: 1, label: '' }])
    const b = relationshipMilestones('Y', [{ date: '2026-06-12', direction: 'down', from: 9, to: 1, delta: -8, spanDays: 1, label: '' }])
    const merged = mergeLifeThread(a, b)
    expect(merged[0].date).toBe('2026-06-12') // más reciente primero
    expect(merged[1].date).toBe('2026-06-10')
  })
})
