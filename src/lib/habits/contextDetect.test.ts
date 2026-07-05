// SIR V2 — Tests 12·M4: detección de contexto → plan_if.

import { describe, it, expect } from 'vitest'
import { detectContext, type CompletionMark } from './contextDetect'

// ISO en hora de pared Lima (UTC-5).
function at(date: string, hh: number): CompletionMark {
  return { completedAt: `${date}T${String(hh).padStart(2, '0')}:00:00-05:00` }
}

describe('detectContext', () => {
  it('null con menos de 3 marcas', () => {
    expect(detectContext([at('2026-07-01', 7), at('2026-07-02', 8)])).toBeNull()
  })

  it('detecta franja mañana y propone plan_if editable', () => {
    const marks = [at('2026-07-01', 7), at('2026-07-02', 7), at('2026-07-03', 8), at('2026-07-04', 6)]
    const p = detectContext(marks)
    expect(p).not.toBeNull()
    expect(p!.franja).toBe('mañana')
    expect(p!.hour).toBe(7) // modal
    expect(p!.planIf).toMatch(/Por la mañana/)
    expect(p!.confidence).toBe('orientativa') // support 4 < 5
  })

  it('sube a "sugerida" con volumen (>=5 en la franja)', () => {
    const marks = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05', '2026-07-06'].map((d) => at(d, 21))
    const p = detectContext(marks)
    expect(p).not.toBeNull()
    expect(p!.franja).toBe('noche')
    expect(p!.confidence).toBe('sugerida')
  })

  it('sin franja modal clara (dispersa, ninguna mayoría) → null', () => {
    // 1 en cada franja: madrugada(3), mañana(9), mediodia(13), tarde(17) → cada una 1/4, ninguna >=0.5 ni >=3
    const marks = [at('2026-07-01', 3), at('2026-07-02', 9), at('2026-07-03', 13), at('2026-07-04', 17)]
    expect(detectContext(marks)).toBeNull()
  })

  it('ignora timestamps inválidos', () => {
    const marks: CompletionMark[] = [
      { completedAt: 'no-fecha' },
      at('2026-07-01', 21), at('2026-07-02', 22), at('2026-07-03', 20),
    ]
    const p = detectContext(marks)
    expect(p).not.toBeNull()
    expect(p!.franja).toBe('noche')
    expect(p!.total).toBe(3)
  })
})
