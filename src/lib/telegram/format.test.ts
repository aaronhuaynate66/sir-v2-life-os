import { describe, it, expect } from 'vitest'
import { toPlainText } from './format'

describe('toPlainText', () => {
  it('quita negritas **/__', () => {
    expect(toPlainText('Diana está en **fase lútea**, día __20__')).toBe('Diana está en fase lútea, día 20')
  })
  it('quita encabezados markdown', () => {
    expect(toPlainText('## Qué significa\ntexto')).toBe('Qué significa\ntexto')
  })
  it('quita reglas horizontales', () => {
    expect(toPlainText('arriba\n\n---\n\nabajo')).toBe('arriba\n\nabajo')
  })
  it('convierte viñetas - en •', () => {
    expect(toPlainText('- uno\n- dos')).toBe('• uno\n• dos')
  })
  it('quita código inline y citas', () => {
    expect(toPlainText('> nota\nusá `cyclePhase`')).toBe('nota\nusá cyclePhase')
  })
  it('convierte enlaces [t](u) → t (u)', () => {
    expect(toPlainText('mirá [el commit](https://x.com/c)')).toBe('mirá el commit (https://x.com/c)')
  })
  it('colapsa saltos de línea excesivos', () => {
    expect(toPlainText('a\n\n\n\nb')).toBe('a\n\nb')
  })
  it('deja texto plano intacto', () => {
    expect(toPlainText('Hola Aaron, todo tranquilo hoy.')).toBe('Hola Aaron, todo tranquilo hoy.')
  })
  it('no lanza con vacío', () => {
    expect(toPlainText('')).toBe('')
  })
})
