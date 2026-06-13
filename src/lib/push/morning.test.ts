import { describe, it, expect } from 'vitest'
import { buildMorningPush } from './morning'

describe('buildMorningPush', () => {
  it('mensaje amable si no hay nada', () => {
    const p = buildMorningPush({})
    expect(p.title).toBe('Buenos días')
    expect(p.body).toContain('nada urgente')
  })
  it('prioriza gente/fechas y dice corto', () => {
    const p = buildMorningPush({ birthdays: [{ name: 'Francisco', days: 3 }], dueTasks: ['Cerrar reporte'] })
    expect(p.body).toContain('Francisco cumple en 3 días')
    expect(p.body).toContain('Hoy vence: Cerrar reporte')
  })
  it('hoy / mañana', () => {
    expect(buildMorningPush({ birthdays: [{ name: 'A', days: 0 }] }).body).toContain('A cumple hoy')
    expect(buildMorningPush({ birthdays: [{ name: 'B', days: 1 }] }).body).toContain('B cumple mañana')
  })
  it('cap a 3 partes (no vuelca)', () => {
    const p = buildMorningPush({
      birthdays: [{ name: 'A', days: 1 }, { name: 'B', days: 2 }],
      dueTasks: ['T1', 'T2'],
      focus: 'Foco X',
      topSignal: 'Señal Y',
    })
    expect(p.body.split(' · ').length).toBe(3)
    expect(p.body).not.toContain('Señal Y') // quedó fuera del cap
  })
  it('varias tareas se cuentan', () => {
    const p = buildMorningPush({ dueTasks: ['T1', 'T2', 'T3'] })
    expect(p.body).toContain('3 tareas para hoy (T1…)')
  })
})
