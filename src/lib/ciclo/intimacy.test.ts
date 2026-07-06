import { describe, it, expect } from 'vitest'
import { cyclePhase } from './phase'
import { intimacyGuidance } from './intimacy'

const TODAY = new Date(2026, 6, 6) // 2026-07-06 local

const ovu = cyclePhase('2026-06-23', 28, TODAY)! // ~día 14 → ventana fértil
const pms = cyclePhase('2026-06-11', 28, TODAY)! // ~día 26 → premenstrual
const mens = cyclePhase('2026-07-04', 28, TODAY)! // ~día 3 → período

describe('intimacyGuidance', () => {
  it('fixtures de fase correctos', () => {
    expect(ovu.isFertileWindow).toBe(true)
    expect(pms.isPmsWindow).toBe(true)
    expect(mens.phase).toBe('menstrual')
  })

  it('SIEMPRE incluye el recordatorio de cuidado (no manejo)', () => {
    for (const g of [intimacyGuidance(ovu), intimacyGuidance(pms), intimacyGuidance(mens)]) {
      expect(g.caution.toLowerCase()).toContain('cuidar')
      expect(g.caution).toContain('manejarla')
      expect(g.caution.toLowerCase()).toContain('tendencia')
    }
  })

  it('ventana fértil + buen contexto → propone conexión con novedad', () => {
    const g = intimacyGuidance(ovu, { personName: 'Diana' })
    expect(g.phaseNote.toLowerCase()).toContain('fértil')
    expect(g.move.toLowerCase()).toContain('novedad')
  })

  it('una TENSIÓN sin resolver manda sobre cualquier ventana', () => {
    const g = intimacyGuidance(ovu, { recentTension: true })
    expect(g.lever.toLowerCase()).toContain('tensión')
    expect(g.move.toLowerCase()).toContain('reconect')
    // no propone "movidas" con la fase; prioriza reparar
    expect(g.move.toLowerCase()).not.toContain('novedad')
  })

  it('premenstrual → presencia y aliviar, sin empujar', () => {
    const g = intimacyGuidance(pms)
    expect(g.phaseNote.toLowerCase()).toContain('premenstrual')
    expect(g.move.toLowerCase()).toMatch(/aliviar|presencia|estar/)
  })
})
