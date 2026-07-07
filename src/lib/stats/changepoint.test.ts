import { describe, it, expect } from 'vitest'
import { detectChangePoint, detectChangePoints } from './changepoint'

describe('detectChangePoint', () => {
  it('detecta una caída clara', () => {
    const cp = detectChangePoint([10, 9, 11, 10, 2, 1, 2, 1])!
    expect(cp).not.toBeNull()
    expect(cp.index).toBe(4)
    expect(cp.delta).toBeLessThan(0)
    expect(cp.beforeAvg).toBeGreaterThan(cp.afterAvg)
  })

  it('detecta una subida clara', () => {
    const cp = detectChangePoint([1, 2, 1, 2, 9, 10, 11, 9])!
    expect(cp.delta).toBeGreaterThan(0)
  })

  it('serie plana o ruido leve → null', () => {
    expect(detectChangePoint([5, 5, 5, 5, 5, 5])).toBeNull()
    expect(detectChangePoint([5, 6, 4, 5, 6, 4])).toBeNull()
  })

  it('serie corta → null', () => {
    expect(detectChangePoint([1, 9])).toBeNull()
  })
})

describe('detectChangePoints (multi)', () => {
  it('detecta DOS regímenes: sube y después baja', () => {
    // bajo → alto → bajo: dos cortes (se calentó, luego se enfrió).
    const series = [...Array(6).fill(2), ...Array(6).fill(20), ...Array(6).fill(3)]
    const cps = detectChangePoints(series, { minSeg: 3 })
    expect(cps.length).toBe(2)
    expect(cps[0].index).toBeLessThan(cps[1].index)
    expect(cps[0].delta).toBeGreaterThan(0) // primero se calentó
    expect(cps[1].delta).toBeLessThan(0)    // después se enfrió
  })

  it('before/after usan los segmentos adyacentes (no toda la serie)', () => {
    const series = [...Array(6).fill(2), ...Array(6).fill(20), ...Array(6).fill(3)]
    const cps = detectChangePoints(series, { minSeg: 3 })
    // el 2do corte compara el plató alto (~20) contra el bajo final (~3)
    expect(cps[1].beforeAvg).toBeGreaterThan(15)
    expect(cps[1].afterAvg).toBeLessThan(6)
  })

  it('serie plana o un solo escalón → 0 o 1 corte, sin espurios', () => {
    expect(detectChangePoints(new Array(12).fill(5))).toEqual([])
    const oneStep = detectChangePoints([...Array(8).fill(2), ...Array(8).fill(20)], { minSeg: 3 })
    expect(oneStep.length).toBe(1)
  })

  it('respeta maxPoints (devuelve los más fuertes)', () => {
    const series = [2, 2, 2, 30, 30, 30, 5, 5, 5, 40, 40, 40, 8, 8, 8, 25, 25, 25]
    const cps = detectChangePoints(series, { minSeg: 3, maxPoints: 2 })
    expect(cps.length).toBeLessThanOrEqual(2)
    expect([...cps]).toEqual([...cps].sort((a, b) => a.index - b.index)) // ordenados por posición
  })
})
