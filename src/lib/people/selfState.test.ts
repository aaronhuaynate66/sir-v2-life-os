import { describe, it, expect } from 'vitest'
import { selfStateGate, buildBlock } from './selfState'
import type { SelfBioState } from './selfState'
import type { EmotionWindow } from '@/engines/emotion'

const win = (over: Partial<EmotionWindow> = {}): EmotionWindow => ({
  state: 'open', stressElevated: false, hrvDown: false, sleepLow: false,
  strategy: null, guidance: null, ...over,
} as EmotionWindow)

const s = (state: SelfBioState['window']['state']): SelfBioState => ({
  window: { state, stressElevated: false, hrvDown: false, sleepLow: false } as SelfBioState['window'],
  sleepDebtHours: null,
  block: null,
})

describe('selfStateGate', () => {
  it('ventana ANGOSTA → aviso fuerte de regular antes de negociar', () => {
    expect(selfStateGate(s('narrow'))).toMatch(/fuera de tu ventana/i)
  })
  it('ventana tensionada → aviso suave', () => {
    expect(selfStateGate(s('watch'))).toMatch(/tensionada/i)
  })
  it('abierta / sin data → sin aviso', () => {
    expect(selfStateGate(s('open'))).toBeNull()
    expect(selfStateGate(s('insufficient'))).toBeNull()
  })
})

describe('buildBlock (bloque que va al prompt del LLM)', () => {
  it('narrow: marca ANGOSTA, lista las señales presentes y exige REGULAR PRIMERO', () => {
    const b = buildBlock(win({ state: 'narrow', stressElevated: true, hrvDown: true, sleepLow: true }), null, null, null)
    expect(b).not.toBeNull()
    expect(b).toContain('ANGOSTA')
    expect(b).toContain('estrés elevado')
    expect(b).toContain('HRV en caída')
    expect(b).toContain('sueño bajo')
    expect(b).toContain('REGULAR PRIMERO')
  })

  it('narrow no filtra señales ausentes (solo estrés)', () => {
    const b = buildBlock(win({ state: 'narrow', stressElevated: true }), null, null, null)
    expect(b).toContain('estrés elevado')
    expect(b).not.toContain('HRV en caída')
    expect(b).not.toContain('sueño bajo')
  })

  it('watch: tensionada + reencuadre, sin el bloque de regular-primero', () => {
    const b = buildBlock(win({ state: 'watch', stressElevated: true }), null, null, null)
    expect(b).toContain('tensionada')
    expect(b).toContain('reencuadre')
    expect(b).not.toContain('REGULAR PRIMERO')
  })

  it('open: ventana abierta, sin instrucción especial', () => {
    const b = buildBlock(win({ state: 'open' }), null, null, null)
    expect(b).toContain('abierta')
    expect(b).not.toContain('REGULAR PRIMERO')
    expect(b).not.toContain('reencuadre')
  })

  it('no contiene voseo argentino (regla español del Perú)', () => {
    const b = buildBlock(win({ state: 'narrow', stressElevated: true, hrvDown: true }), null, null, null)
    expect(b).toContain('Prioriza eso') // peruano, no "Priorizá eso"
    expect(b).not.toContain('Priorizá')
    expect(b).not.toMatch(/\b(vos|sos|tenés|querés|mirá|dale)\b/i)
  })

  it('insufficient sin métricas → null (nada que decir)', () => {
    expect(buildBlock(win({ state: 'insufficient' }), null, null, null)).toBeNull()
  })

  it('insufficient PERO con energía/ánimo/deuda → arma el bloque igual', () => {
    const b = buildBlock(win({ state: 'insufficient' }), 3, 4, 5)
    expect(b).not.toBeNull()
    // sin data de ventana no aparece el bit de estado (abierta/ANGOSTA/tensionada),
    // aunque la línea base siempre mencione "la ventana de tolerancia manda".
    expect(b).not.toContain('ventana de tolerancia: ')
    expect(b).toContain('deuda de sueño acumulada ~3h')
    expect(b).toContain('energía reciente 4/10')
    expect(b).toContain('ánimo reciente 5/10')
  })

  it('deuda de sueño < 2h no se menciona (umbral)', () => {
    const b = buildBlock(win({ state: 'insufficient' }), 1, 4, null)
    expect(b).not.toContain('deuda de sueño')
    expect(b).toContain('energía reciente 4/10')
  })
})
