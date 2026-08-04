import { describe, expect, it } from 'vitest'

import {
  botonesDeToma, horaDeRecordatorioDeToma, medAllCallbackData, medCallbackData, parseMedAllCallback,
  parseMedCallback, remIdDeToma, textoDeToma,
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

// ═══ LA INTENCIÓN VA EN EL ID, NO EN LA HORA ═══
// El cron decidía si adjuntar botones mirando la HORA de cualquier recordatorio con
// `med_prescription_id`. Funcionaba de casualidad: el recordatorio de los 5 laboratorios
// del neurólogo también cuelga de esa receta (es su monitoreo), y si hubiera caído a una
// hora con medicamentos agendados, el cron le habría REEMPLAZADO el texto por el de la
// toma — el aviso de los laboratorios habría desaparecido sin dejar rastro.
describe('horaDeRecordatorioDeToma', () => {
  it('el formato del id del cargador es el que el cron sabe leer', () => {
    // Si esto cambia, hay que cambiar TAMBIÉN scripts/import-recetas.mjs, que lo duplica
    // porque un .mjs no puede importar este módulo.
    expect(remIdDeToma('2026-08-05', '22:00')).toBe('rem_med_2026-08-05_2200')
    expect(horaDeRecordatorioDeToma(remIdDeToma('2026-08-05', '22:00'))).toBe('22:00')
    expect(horaDeRecordatorioDeToma(remIdDeToma('2026-12-31', '08:30'))).toBe('08:30')
  })

  it('un recordatorio que NO es una toma devuelve null aunque cuelgue de la receta', () => {
    // El caso real: el de los 5 laboratorios del neurólogo.
    expect(horaDeRecordatorioDeToma('rem_labs_neuro_orden')).toBeNull()
    expect(horaDeRecordatorioDeToma('rem_examen_ipd')).toBeNull()
    expect(horaDeRecordatorioDeToma('cualquier-otro-id')).toBeNull()
  })

  it('no revienta con basura ni acepta ids a medias', () => {
    for (const v of [null, undefined, '', 'rem_med_', 'rem_med_2026-08-05', 'rem_med_2026-08-05_22']) {
      expect(horaDeRecordatorioDeToma(v)).toBeNull()
    }
  })

  it('rechaza horas imposibles dentro de un id bien formado', () => {
    expect(horaDeRecordatorioDeToma('rem_med_2026-08-05_2560')).toBeNull()
    expect(horaDeRecordatorioDeToma('rem_med_2026-08-05_2359')).toBe('23:59')
  })
})
