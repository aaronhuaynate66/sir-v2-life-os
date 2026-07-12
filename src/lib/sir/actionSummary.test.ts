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

  it('no usa markdown (Telegram lo muestra crudo)', () => {
    const s = summarizeActionForConfirm({
      kind: 'registrar_interaccion', persona: 'Ana', calidad: 3, nota: '', personId: 'p2',
    } as ProposedActionResolved)
    expect(s).not.toMatch(/[*_#]/)
  })
})
