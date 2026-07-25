import { describe, it, expect } from 'vitest'
import { assessCapacity, explainCapacity, applyEnergyGate, DEMANDING_SLOTS } from './energyGate'
import type { MorningSignal } from '@/lib/push/morning'

const s = (slot: string, text: string, section: MorningSignal['section'] = 'gente'): MorningSignal => ({ slot, section, text })

const TAREA = s('dueTask', 'Hoy vence: UAT con Dayana', 'hoy')
const MAMA = s('relationshipNudge', 'Hace 3 semanas sin hablar con tu mamá')
const CONFLICTO = s('momentResolution', 'El conflicto por el Mundial parece resuelto — ¿lo cierras?')
const ALERTA = s('metricAlert', 'Peso fuera de categoría para el Mundial', 'hoy')

describe('assessCapacity', () => {
  it('fuera de la ventana → bajo, pase lo que pase', () => {
    expect(assessCapacity({ windowState: 'narrow', sleepDebtHours: 0 })).toBe('bajo')
  })

  it('deuda de sueño alta → bajo aunque la ventana no diga nada', () => {
    expect(assessCapacity({ windowState: 'insufficient', sleepDebtHours: 3.5 })).toBe('bajo')
  })

  it('una noche rota basta: score bajo + muchos despertares', () => {
    expect(assessCapacity({
      windowState: 'insufficient', sleepDebtHours: null,
      lastNight: { durationH: 5.2, score: 48, awakenings: 4 },
    })).toBe('bajo')
  })

  it('noche corta pero buena NO baja el veredicto (no todo sueño corto es malo)', () => {
    expect(assessCapacity({
      windowState: 'open', sleepDebtHours: null,
      lastNight: { durationH: 6.1, score: 82, awakenings: 1 },
    })).toBe('ok')
  })

  it('ventana tensionada o deuda media → tensionado', () => {
    expect(assessCapacity({ windowState: 'watch', sleepDebtHours: null })).toBe('tensionado')
    expect(assessCapacity({ windowState: 'open', sleepDebtHours: 2.4 })).toBe('tensionado')
  })

  it('sin data no inventa un problema', () => {
    expect(assessCapacity({ windowState: 'insufficient', sleepDebtHours: null })).toBe('ok')
  })

  it('la noche REAL del 24→25 jul (9h34, score 78, 2 despertares) no baja nada', () => {
    expect(assessCapacity({
      windowState: 'insufficient', sleepDebtHours: null,
      lastNight: { durationH: 9.57, score: 78, awakenings: 2 },
    })).toBe('ok')
  })
})

describe('explainCapacity', () => {
  it('habla con el dato, no con etiquetas', () => {
    const r = explainCapacity({
      windowState: 'narrow', sleepDebtHours: 3.2,
      lastNight: { durationH: 5.5, score: 45, awakenings: 4 },
    })
    expect(r).toContain('dormiste 5h 30m')
    expect(r).toContain('4 despertares')
    expect(r).toContain('deuda de sueño ~3h')
  })

  it('sin data devuelve vacío', () => {
    expect(explainCapacity({ windowState: 'insufficient', sleepDebtHours: null })).toBe('')
  })
})

describe('applyEnergyGate', () => {
  const señales = [TAREA, MAMA, CONFLICTO, ALERTA]

  it('con capacidad ok no toca nada', () => {
    const r = applyEnergyGate(señales, 'ok', 'x')
    expect(r.visible).toEqual(señales)
    expect(r.deferred).toEqual([])
    expect(r.note).toBe('')
  })

  it('con poco combustible pospone lo que pide energía emocional', () => {
    const r = applyEnergyGate(señales, 'bajo', 'dormiste 5h · 4 despertares')
    expect(r.deferred.map((x) => x.slot).sort()).toEqual(['momentResolution', 'relationshipNudge'])
    expect(r.visible.map((x) => x.slot).sort()).toEqual(['dueTask', 'metricAlert'])
  })

  it('lo que VENCE HOY nunca se pospone', () => {
    const r = applyEnergyGate(señales, 'bajo', '')
    expect(r.visible).toContain(TAREA)
    expect(r.visible).toContain(ALERTA)
  })

  it('nunca pospone en silencio: la nota lo dice', () => {
    const r = applyEnergyGate(señales, 'bajo', 'dormiste 5h')
    expect(r.note).toContain('dejé')
    expect(r.note).toContain('dormiste 5h')
    expect(r.note).toContain('Si igual lo quieres ver')
  })

  it('tensionado avisa pero no esconde nada', () => {
    const r = applyEnergyGate(señales, 'tensionado', 'deuda de sueño ~2h')
    expect(r.deferred).toEqual([])
    expect(r.visible).toEqual(señales)
    expect(r.note).toContain('justo')
  })

  it('tensionado sin nada exigente no dice nada', () => {
    expect(applyEnergyGate([TAREA], 'tensionado', 'x').note).toBe('')
  })

  it('bajo sin nada exigente: solo cuida, no promete aplazar nada', () => {
    const r = applyEnergyGate([TAREA], 'bajo', 'dormiste 4h')
    expect(r.deferred).toEqual([])
    expect(r.note).toContain('poco combustible')
    expect(r.note).not.toContain('dejé')
  })

  it('los slots exigentes son los que abren conversación, no los urgentes', () => {
    expect(DEMANDING_SLOTS).toContain('relationshipNudge')
    expect(DEMANDING_SLOTS).not.toContain('dueTask')
    expect(DEMANDING_SLOTS).not.toContain('metricAlert')
  })
})
