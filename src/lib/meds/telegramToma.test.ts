import { describe, expect, it } from 'vitest'

import {
  botonesDeToma, medAllCallbackData, medCallbackData, parseMedAllCallback, parseMedCallback, textoDeToma,
  type MedDeToma,
} from './telegramToma'

const med = (o: Partial<MedDeToma> = {}): MedDeToma => ({
  itemId: 'presci_maxilo_orfenadrina', medName: 'Orfenadrina', dose: '100 mg', yaHoy: false, ...o,
})

describe('callback data', () => {
  it('ida y vuelta del individual', () => {
    expect(parseMedCallback(medCallbackData('presci_neuro_topiramato'))).toBe('presci_neuro_topiramato')
  })
  it('ida y vuelta del "todas"', () => {
    expect(parseMedAllCallback(medAllCallbackData('22:00'))).toBe('22:00')
    expect(parseMedAllCallback(medAllCallbackData('08:30'))).toBe('08:30')
  })
  it('no confunde un callback con el otro', () => {
    expect(parseMedCallback(medAllCallbackData('22:00'))).toBeNull()
    expect(parseMedAllCallback(medCallbackData('x'))).toBeNull()
  })
  it('ignora callbacks ajenos y basura', () => {
    for (const v of ['habit:123', 'feedback:up', '', null, undefined, 'med:', 'medall:', 'medall:99:99']) {
      expect(parseMedCallback(v)).not.toBe('')
      expect(parseMedAllCallback(v)).toBeNull()
    }
    expect(parseMedCallback('med:')).toBeNull()
  })
  it('rechaza horas imposibles', () => {
    expect(parseMedAllCallback('medall:2560')).toBeNull()
    expect(parseMedAllCallback('medall:2399')).toBeNull()
    expect(parseMedAllCallback('medall:2359')).toBe('23:59')
  })
  // El límite de la Bot API. Si esto se rompe, el botón no funciona en producción.
  it('cabe en los 64 bytes de callback_data', () => {
    const largo = medCallbackData('presci_neuro_topiramato')
    expect(Buffer.byteLength(largo, 'utf8')).toBeLessThanOrEqual(64)
    expect(Buffer.byteLength(medAllCallbackData('22:00'), 'utf8')).toBeLessThanOrEqual(64)
  })
})

describe('botonesDeToma', () => {
  it('un botón por medicamento y "Todas" cuando hay 2+ pendientes', () => {
    const f = botonesDeToma([
      med(),
      med({ itemId: 'presci_maxilo_etoricoxib', medName: 'Etoricoxib', dose: '120 mg' }),
    ], '22:00')
    expect(f).toHaveLength(3)
    expect(f[0][0].text).toBe('✅ Orfenadrina')
    expect(f[2][0].text).toBe('✅ Todas (2)')
  })

  it('con UNA sola pendiente no ofrece "Todas": sería ruido', () => {
    const f = botonesDeToma([med()], '22:00')
    expect(f).toHaveLength(1)
    expect(f.flat().some((b) => b.text.includes('Todas'))).toBe(false)
  })

  it('lo ya tomado hoy se marca con ✓ y no cuenta para "Todas"', () => {
    const f = botonesDeToma([
      med({ yaHoy: true }),
      med({ itemId: 'b', medName: 'Etoricoxib', yaHoy: true }),
      med({ itemId: 'c', medName: 'Clonazepam' }),
    ], '22:00')
    expect(f[0][0].text).toBe('✓ Orfenadrina')
    // Sólo 1 pendiente → sin botón de todas.
    expect(f.flat().some((b) => b.text.includes('Todas'))).toBe(false)
  })

  it('sin medicamentos no hay botones', () => {
    expect(botonesDeToma([], '22:00')).toEqual([])
    // @ts-expect-error entrada inválida a propósito
    expect(botonesDeToma(null, '22:00')).toEqual([])
  })

  it('descarta filas sin id o sin nombre', () => {
    // @ts-expect-error entrada inválida a propósito
    expect(botonesDeToma([{ itemId: '', medName: 'X' }, { itemId: 'y', medName: '' }], '22:00')).toEqual([])
  })
})

describe('textoDeToma', () => {
  it('nombra los pendientes con su dosis', () => {
    const t = textoDeToma([med(), med({ itemId: 'b', medName: 'Topiramato', dose: '100 mg' })], '22:00')
    expect(t).toContain('Toma de las 22:00')
    expect(t).toContain('Orfenadrina 100 mg')
    expect(t).toContain('Topiramato 100 mg')
  })
  it('si ya está todo tomado, lo dice y no pide nada', () => {
    const t = textoDeToma([med({ yaHoy: true })], '22:00')
    expect(t).toContain('ya registraste todo')
    expect(t).not.toContain('Toca lo que')
  })
  it('no muestra los ya tomados en la lista de pendientes', () => {
    const t = textoDeToma([med({ yaHoy: true }), med({ itemId: 'b', medName: 'Clonazepam', dose: '2 mg' })], '22:00')
    expect(t).toContain('Clonazepam 2 mg')
    expect(t).not.toContain('Orfenadrina')
  })
})
