import { describe, it, expect } from 'vitest'
import { summarizeActionForConfirm } from './actionSummary'
import type { ProposedActionResolved } from './askSir'

describe('summarizeActionForConfirm', () => {
  it('interacción: nombra persona, tono y nota, y pregunta', () => {
    const s = summarizeActionForConfirm({
      kind: 'registrar_interaccion', persona: 'Pablo', calidad: 5, nota: 'quiere avanzar', personId: 'p1',
    } as ProposedActionResolved)
    expect(s).toContain('Pablo')
    expect(s).toContain('5/5')
    expect(s).toContain('quiere avanzar')
    expect(s).toMatch(/¿lo registro\?/i)
  })

  it('marcar_tarea: nombra la tarea y pregunta', () => {
    const s = summarizeActionForConfirm({ kind: 'marcar_tarea', tarea: 'sacar la visa' } as ProposedActionResolved)
    expect(s).toContain('sacar la visa')
    expect(s).toMatch(/¿la marco\?/i)
  })

  it('agregar_hito: nombra el paso, el objetivo y la fecha opcional', () => {
    const s = summarizeActionForConfirm({
      kind: 'agregar_hito', objetivo: 'Mundial de Bomberos', hito: 'Pasar examen médico IPD', fecha: '2026-08-15', objetivoId: 'g1',
    } as ProposedActionResolved)
    expect(s).toContain('Pasar examen médico IPD')
    expect(s).toContain('Mundial de Bomberos')
    expect(s).toContain('2026-08-15')
    expect(s).toMatch(/¿lo agrego\?/i)
  })

  it('crear_plan: nombra el plan y la fecha', () => {
    const s = summarizeActionForConfirm({ kind: 'crear_plan', titulo: 'Ver depa', fecha: '2026-07-19', persona: null, nota: '' } as ProposedActionResolved)
    expect(s).toContain('Ver depa')
    expect(s).toContain('2026-07-19')
  })

  it('no usa markdown (Telegram lo muestra crudo)', () => {
    const s = summarizeActionForConfirm({
      kind: 'registrar_interaccion', persona: 'Ana', calidad: 3, nota: '', personId: 'p2',
    } as ProposedActionResolved)
    expect(s).not.toMatch(/[*_#]/)
  })
})
