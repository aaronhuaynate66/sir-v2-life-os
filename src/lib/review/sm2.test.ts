import { describe, it, expect } from 'vitest'
import { applyReview, type CardState } from './sm2'

const NEW: CardState = { intervalDays: 0, easeFactor: 2.5, streak: 0 }

describe('applyReview — card nueva', () => {
  it('grade 0 → 1d, streak 0, ease baja 0.2', () => {
    const r = applyReview(NEW, 0)
    expect(r.intervalDays).toBe(1)
    expect(r.streak).toBe(0)
    expect(r.easeFactor).toBeCloseTo(2.3, 2)
    expect(r.nextReviewInDays).toBe(1)
  })
  it('grade 1 → 1d, streak 0, ease baja 0.1', () => {
    const r = applyReview(NEW, 1)
    expect(r.intervalDays).toBe(1)
    expect(r.easeFactor).toBeCloseTo(2.4, 2)
  })
  it('grade 2 → 3d, streak 1', () => {
    const r = applyReview(NEW, 2)
    expect(r.intervalDays).toBe(3)
    expect(r.streak).toBe(1)
  })
  it('grade 3 → 5d, streak 1, ease sube 0.1', () => {
    const r = applyReview(NEW, 3)
    expect(r.intervalDays).toBe(5)
    expect(r.easeFactor).toBeCloseTo(2.6, 2)
  })
})

describe('applyReview — card vista', () => {
  const KNOWN: CardState = { intervalDays: 5, easeFactor: 2.5, streak: 2 }
  it('grade 0 → reset 1d, streak 0', () => {
    const r = applyReview(KNOWN, 0)
    expect(r.intervalDays).toBe(1)
    expect(r.streak).toBe(0)
    expect(r.easeFactor).toBeCloseTo(2.3, 2)
  })
  it('grade 2 → interval*ease', () => {
    const r = applyReview(KNOWN, 2)
    expect(r.intervalDays).toBe(Math.round(5 * 2.5))
    expect(r.streak).toBe(3)
  })
  it('grade 3 → interval*ease*1.3, ease+0.1', () => {
    const r = applyReview(KNOWN, 3)
    expect(r.intervalDays).toBe(Math.round(5 * 2.5 * 1.3))
    expect(r.easeFactor).toBeCloseTo(2.6, 2)
  })
})

describe('applyReview — ease clamp', () => {
  it('ease no baja de 1.3', () => {
    const bad: CardState = { intervalDays: 5, easeFactor: 1.4, streak: 1 }
    const r = applyReview(bad, 0)
    expect(r.easeFactor).toBe(1.3)
  })
  it('ease no sube de 3.0', () => {
    const good: CardState = { intervalDays: 5, easeFactor: 2.95, streak: 5 }
    const r = applyReview(good, 3)
    expect(r.easeFactor).toBe(3.0)
  })
})
