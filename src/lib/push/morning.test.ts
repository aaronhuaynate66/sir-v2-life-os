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

describe('buildMorningPush — hábito a retomar', () => {
  it('incluye el nudge de hábito cuando viene', () => {
    const p = buildMorningPush({ habitNudge: 'Se cortó tu racha de "Meditar". Retomala hoy.' })
    expect(p.body).toContain('Se cortó tu racha de "Meditar"')
  })
  it('respeta el cap de 3 partes con hábito', () => {
    const p = buildMorningPush({
      birthdays: [{ name: 'A', days: 1 }],
      dueTasks: ['T1'],
      habitNudge: 'Racha rota X',
      focus: 'Foco',
    })
    expect(p.body.split(' · ').length).toBe(3)
    expect(p.body).not.toContain('Foco') // quedó fuera del cap (hábito entró antes)
  })
})

describe('buildMorningPush — a quién cuidar hoy (nudge relacional)', () => {
  it('incluye el nudge relacional cuando viene', () => {
    const p = buildMorningPush({ relationshipNudge: 'Diana (tu pareja) — Sin hablar hace 12 días' })
    expect(p.body).toContain('Diana (tu pareja)')
    expect(p.body).toContain('Sin hablar hace 12 días')
  })
  it('va después de las fechas pero antes de las tareas', () => {
    const p = buildMorningPush({
      birthdays: [{ name: 'Pedro', days: 2 }],
      relationshipNudge: 'Sasa — Relación dormida',
      dueTasks: ['Cerrar reporte'],
    })
    expect(p.body.indexOf('Pedro')).toBeLessThan(p.body.indexOf('Sasa'))
    expect(p.body.indexOf('Sasa')).toBeLessThan(p.body.indexOf('Cerrar reporte'))
  })
})

describe('buildMorningPush — fechas especiales / aniversarios', () => {
  it('incluye el aniversario mensual (mesario) en el brief', () => {
    const p = buildMorningPush({ importantDates: ['Aniversario mensual relación (13) · ¡Hoy!'] })
    expect(p.body).toContain('Aniversario mensual')
    expect(p.body).toContain('¡Hoy!')
  })
  it('las fechas especiales van ANTES que los cumpleaños', () => {
    const p = buildMorningPush({
      importantDates: ['Aniversario con Diana · ¡Hoy!'],
      birthdays: [{ name: 'Pedro', days: 4 }],
    })
    expect(p.body.indexOf('Aniversario con Diana')).toBeLessThan(p.body.indexOf('Pedro'))
  })
})
