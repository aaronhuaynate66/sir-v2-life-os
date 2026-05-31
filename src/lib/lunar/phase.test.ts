// SIR V2 — Tests de la fase lunar (util puro determinístico).
//
// moonPhase() es aritmética astronómica pura: Julian Day + módulo del mes
// sinódico + bucketing NO equiespaciado con wraparound de la fase 'new'.
// Un regression acá (ej. alguien "simplifica" a buckets equiespaciados)
// mal-etiquetaría fases en silencio — es justo el bug que el comentario
// de la Sesión 7 documenta (age=13.77 caía en 'full' al 99%).
//
// Estrategia: construir fechas a una EDAD conocida desde la luna nueva de
// referencia (2000-01-06 18:14 UTC) y verificar fase/iluminación/waxing.
// Las edades se eligen con margen ≥0.1d de las fronteras de bucket para
// que la deriva de ~1min del epoch no afecte el bucket.

import { describe, it, expect } from 'vitest'

import { moonPhase, moonPhaseId } from './phase'

const SYNODIC = 29.53058867
// Mismo epoch que phase.ts (2000-01-06 18:14 UTC). Edad ≈ 0 acá.
const REF_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14, 0)

/** Date a una edad lunar dada (días desde la luna nueva de referencia). */
function dateAtAge(ageDays: number): Date {
  return new Date(REF_NEW_MOON_MS + ageDays * 86_400_000)
}

describe('moonPhase — bucketing por edad', () => {
  it('edad ~0 → luna nueva, creciente, iluminación ~0', () => {
    const p = moonPhase(dateAtAge(0.2))
    expect(p.phase).toBe('new')
    expect(p.label).toBe('Luna nueva')
    expect(p.symbol).toBe('🌑')
    expect(p.waxing).toBe(true)
    expect(p.illumination).toBeCloseTo(0, 1)
    expect(p.ageDays).toBeCloseTo(0.2, 1)
  })

  it('edad ~7.38 → cuarto creciente, iluminación ~0.5', () => {
    const p = moonPhase(dateAtAge(7.38))
    expect(p.phase).toBe('first_quarter')
    expect(p.illumination).toBeCloseTo(0.5, 1)
    expect(p.waxing).toBe(true)
  })

  it('edad ~14.76 → luna llena, iluminación ~1.0', () => {
    const p = moonPhase(dateAtAge(14.765))
    expect(p.phase).toBe('full')
    expect(p.illumination).toBeCloseTo(1, 1)
  })

  it('edad ~22.15 → cuarto menguante, iluminación ~0.5, menguante', () => {
    const p = moonPhase(dateAtAge(22.148))
    expect(p.phase).toBe('last_quarter')
    expect(p.illumination).toBeCloseTo(0.5, 1)
    expect(p.waxing).toBe(false)
  })

  it('REGRESSION (Sesión 7): edad 13.77 NO es "full" — es creciente gibosa', () => {
    // El bucketing equiespaciado viejo metía 13.77 en 'full' al 99%.
    // La ventana angosta de 'full' ([14.265, 15.265]) deja 13.77 en gibosa.
    const p = moonPhase(dateAtAge(13.77))
    expect(p.phase).toBe('waxing_gibbous')
    expect(p.phase).not.toBe('full')
    expect(p.waxing).toBe(true)
  })

  it('edad cerca del fin del mes (>29.03) → wraparound a "new", pero menguante', () => {
    const p = moonPhase(dateAtAge(29.2))
    expect(p.phase).toBe('new')
    // Geometría: 29.2 está en la 2da mitad del sinódico → waning, NO waxing.
    expect(p.waxing).toBe(false)
    expect(p.illumination).toBeCloseTo(0, 1)
  })
})

describe('moonPhase — invariantes', () => {
  it('iluminación siempre en [0, 1] y ageDays en [0, SYNODIC) para todo el ciclo', () => {
    for (let age = 0; age < SYNODIC; age += 0.37) {
      const p = moonPhase(dateAtAge(age))
      expect(p.illumination).toBeGreaterThanOrEqual(0)
      expect(p.illumination).toBeLessThanOrEqual(1)
      expect(p.ageDays).toBeGreaterThanOrEqual(0)
      expect(p.ageDays).toBeLessThan(SYNODIC)
    }
  })

  it('waxing es la primera mitad del sinódico (edad < SYNODIC/2)', () => {
    expect(moonPhase(dateAtAge(5)).waxing).toBe(true)
    expect(moonPhase(dateAtAge(10)).waxing).toBe(true)
    expect(moonPhase(dateAtAge(20)).waxing).toBe(false)
    expect(moonPhase(dateAtAge(27)).waxing).toBe(false)
  })

  it('default param no lanza y devuelve una de las 8 fases válidas', () => {
    const p = moonPhase()
    expect([
      'new', 'waxing_crescent', 'first_quarter', 'waxing_gibbous',
      'full', 'waning_gibbous', 'last_quarter', 'waning_crescent',
    ]).toContain(p.phase)
  })
})

describe('moonPhaseId', () => {
  it('coincide con moonPhase().phase para fechas a lo largo del ciclo', () => {
    for (const age of [0.2, 7.38, 13.77, 14.765, 22.148, 29.2]) {
      const d = dateAtAge(age)
      expect(moonPhaseId(d)).toBe(moonPhase(d).phase)
    }
  })
})
