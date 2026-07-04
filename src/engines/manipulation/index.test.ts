// SIR V2 — Tests del detector de manipulación entrante (16·M3).

import { describe, it, expect } from 'vitest'
import { detectManipulation, type ManipulationTactic } from './index'

function tactics(text: string): ManipulationTactic[] {
  return detectManipulation(text).hits.map((h) => h.tactic)
}

describe('detectManipulation — tácticas individuales', () => {
  it('autoridad: "soy de TI"', () => {
    expect(tactics('Hola, soy de TI y necesito tu contraseña.')).toContain('authority')
  })
  it('urgencia: "tu cuenta será suspendida"', () => {
    expect(tactics('Tu cuenta será suspendida si no respondés.')).toContain('urgency')
  })
  it('escasez: "última oportunidad" (con y sin acento)', () => {
    expect(tactics('Es tu última oportunidad.')).toContain('scarcity')
    expect(tactics('Es tu ultima oportunidad.')).toContain('scarcity')
  })
  it('miedo: "detectamos actividad sospechosa"', () => {
    expect(tactics('Detectamos actividad sospechosa en tu cuenta.')).toContain('fear')
  })
  it('reciprocidad forzada', () => {
    expect(tactics('Después de todo lo que hice por vos, me debes esto.')).toContain('reciprocity')
  })
  it('prueba social', () => {
    expect(tactics('Miles de personas ya lo hicieron, no seas el único.')).toContain('social_proof')
  })
  it('compromiso previo', () => {
    expect(tactics('Quedamos en que lo ibas a hacer, no te eches para atrás.')).toContain('commitment')
  })
  it('inglés también (phishing típico)', () => {
    const t = tactics('This is IT support. Suspicious activity detected, act now within 24 hours.')
    expect(t).toContain('authority')
    expect(t).toContain('fear')
    expect(t).toContain('urgency')
  })
})

describe('detectManipulation — riesgo', () => {
  it('texto neutro → none, sin hits', () => {
    const r = detectManipulation('Hola, ¿nos juntamos el viernes a almorzar?')
    expect(r.risk).toBe('none')
    expect(r.hits).toHaveLength(0)
  })
  it('una sola señal → low', () => {
    expect(detectManipulation('Última oportunidad para el descuento.').risk).toBe('low')
  })
  it('dos señales → medium', () => {
    // escasez + prueba social, sin la firma autoridad+urgencia
    const r = detectManipulation('Última oportunidad, miles de personas ya lo hicieron.')
    expect(r.risk).toBe('medium')
  })
  it('la firma clásica (autoridad + urgencia + miedo) → high + combo', () => {
    const r = detectManipulation(
      'Soy del banco. Detectamos actividad sospechosa y tu cuenta será suspendida. Respondé ya.',
    )
    expect(r.combo).toBe(true)
    expect(r.risk).toBe('high')
  })
  it('3+ señales sin la firma → high', () => {
    const r = detectManipulation('Última oportunidad, miles de personas ya lo hicieron, vas a perder todo.')
    expect(r.hits.length).toBeGreaterThanOrEqual(3)
    expect(r.risk).toBe('high')
  })
})

describe('detectManipulation — evidencia y bordes', () => {
  it('la evidencia sale del texto original (conserva acentos/mayúsculas)', () => {
    const r = detectManipulation('Es tu ÚLTIMA OPORTUNIDAD hoy.')
    const scarcity = r.hits.find((h) => h.tactic === 'scarcity')
    expect(scarcity?.evidence[0]?.toLowerCase()).toContain('ltima oportunidad')
  })
  it('no duplica evidencia repetida', () => {
    const r = detectManipulation('urgente urgente urgente')
    const urgency = r.hits.find((h) => h.tactic === 'urgency')
    expect(urgency?.evidence).toHaveLength(1)
  })
  it('texto vacío → none sin romper', () => {
    const r = detectManipulation('')
    expect(r.risk).toBe('none')
    expect(r.advice).toContain('No detecté')
  })
  it('el consejo de riesgo alto manda a verificar por otro canal', () => {
    const r = detectManipulation('Soy de soporte, urgente: acceso no autorizado, tu cuenta será bloqueada.')
    expect(r.risk).toBe('high')
    expect(r.advice.toLowerCase()).toContain('otro canal')
  })
  it('el consejo de none es honesto (ausencia ≠ seguro)', () => {
    expect(detectManipulation('¿todo bien?').advice.toLowerCase()).toContain('no garantiza')
  })
})
