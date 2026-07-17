import { describe, it, expect } from 'vitest'
import { avatarCropRect } from './cropRect'

describe('avatarCropRect', () => {
  it('centra un cuadrado 1.5× la caja alrededor de la cara', () => {
    // Caja de 0.2×0.2 centrada en (0.5,0.4) sobre 1000×1000.
    const r = avatarCropRect({ x: 0.4, y: 0.3, w: 0.2, h: 0.2 }, 1000, 1000)
    // lado = 0.2*1000*1.5 = 300; centro (500,400) → left 350, top 250.
    expect(r.side).toBe(300)
    expect(r.left).toBe(350)
    expect(r.top).toBe(250)
  })
  it('clampea a los bordes (caja pegada a la esquina)', () => {
    const r = avatarCropRect({ x: 0, y: 0, w: 0.3, h: 0.3 }, 800, 600)
    expect(r.left).toBe(0)
    expect(r.top).toBe(0)
    expect(r.left + r.side).toBeLessThanOrEqual(800)
    expect(r.top + r.side).toBeLessThanOrEqual(600)
  })
  it('no excede el lado menor de la imagen', () => {
    const r = avatarCropRect({ x: 0, y: 0, w: 1, h: 1 }, 400, 900)
    expect(r.side).toBeLessThanOrEqual(400)
  })
})
