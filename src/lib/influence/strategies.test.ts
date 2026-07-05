// SIR V2 — Tests del repertorio de movidas honestas (16·M4/M1).

import { describe, it, expect } from 'vitest'
import { strategiesForAmbito, renderStrategiesForPrompt, STRATEGIES } from './strategies'
import { buildRehearseUserContent, type RehearseContext } from './rehearsePrompt'

describe('strategiesForAmbito — filtro por vínculo', () => {
  it('afectivo (personal): incluye cuidado, EXCLUYE las transaccionales', () => {
    const ids = strategiesForAmbito('personal').map((s) => s.id)
    expect(ids).toContain('empathy')
    expect(ids).toContain('elicit_preference')
    expect(ids).toContain('generosity')
    // Nada de foot-in-the-door / vouch-fairness / apelaciones profesionales en lo afectivo.
    expect(ids).not.toContain('foot_in_the_door')
    expect(ids).not.toContain('vouch_fairness')
    expect(ids).not.toContain('logical_appeal')
  })

  it('afectivo por relationship romantic (sin ámbito explícito)', () => {
    const ids = strategiesForAmbito(undefined, 'romantic').map((s) => s.id)
    expect(ids).toContain('empathy')
    expect(ids).not.toContain('foot_in_the_door')
  })

  it('profesional (colega): incluye lo integrativo + apelaciones', () => {
    const ids = strategiesForAmbito('colega').map((s) => s.id)
    expect(ids).toContain('logical_appeal')
    expect(ids).toContain('vouch_fairness')
    expect(ids).toContain('foot_in_the_door')
    expect(ids).toContain('empathy') // las 'ambos' también
  })

  it('sin ámbito ni relación → solo las universales (ambos)', () => {
    const scopes = new Set(strategiesForAmbito().map((s) => s.scope))
    expect([...scopes]).toEqual(['ambos'])
  })
})

describe('renderStrategiesForPrompt', () => {
  it('afectivo: encabezado de CUIDADO, no de táctica', () => {
    const txt = renderStrategiesForPrompt('personal')
    expect(txt).toMatch(/CUIDADO Y CLARIDAD/)
    expect(txt).toMatch(/NO son tácticas/)
    expect(txt).not.toMatch(/foot|Empezar por un paso chico/)
  })
  it('profesional: encabezado integrativo + nombra la base científica', () => {
    const txt = renderStrategiesForPrompt('lead')
    expect(txt).toMatch(/INTEGRATIVAS/)
    expect(txt).toMatch(/CaSiNo/)
    expect(txt).toMatch(/Razón y datos/)
  })
})

describe('el prompt del ensayo inyecta el repertorio', () => {
  it('afectivo: el user content trae el repertorio de cuidado', () => {
    const ctx: RehearseContext = { personName: 'Diana', ambito: 'personal', relationship: 'romantic', memories: [] }
    const content = buildRehearseUserContent(ctx, 'reparar la pelea')
    expect(content).toMatch(/CUIDADO Y CLARIDAD/)
    expect(content).toMatch(/Validar lo que siente/)
  })
  it('profesional: trae el repertorio integrativo', () => {
    const ctx: RehearseContext = { personName: 'Alex', ambito: 'colega', memories: [] }
    const content = buildRehearseUserContent(ctx, 'pedir un aumento')
    expect(content).toMatch(/INTEGRATIVAS/)
    expect(content).toMatch(/Mostrar tu valor real/)
  })
})

describe('catálogo', () => {
  it('ids únicos y campos completos', () => {
    const ids = new Set(STRATEGIES.map((s) => s.id))
    expect(ids.size).toBe(STRATEGIES.length)
    for (const s of STRATEGIES) {
      expect(s.label.length).toBeGreaterThan(0)
      expect(s.how.length).toBeGreaterThan(0)
    }
  })
})
