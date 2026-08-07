import { describe, expect, it } from 'vitest'

import {
  botonesDeToma, horaDeRecordatorioDeToma, medAllCallbackData, medCallbackData, parseMedAllCallback,
  parseMedCallback, remIdDeToma, textoDeToma, slotDeDosis,
  fechaDeRecordatorioDeToma, cuandoDeLaToma,
  type MedDeToma,
} from './telegramToma'

const med = (o: Partial<MedDeToma> = {}): MedDeToma => ({
  itemId: 'presci_maxilo_orfenadrina', medName: 'Orfenadrina', dose: '100 mg', yaRegistrada: false, ...o,
})

describe('callback data', () => {
  it('ida y vuelta del individual', () => {
    expect(parseMedCallback(medCallbackData('presci_neuro_topiramato'))).toEqual({ itemId: 'presci_neuro_topiramato', slot: null })
  })
  it('ida y vuelta del "todas"', () => {
    expect(parseMedAllCallback(medAllCallbackData('22:00'))).toEqual({ hora: '22:00', slot: null })
    expect(parseMedAllCallback(medAllCallbackData('08:30'))).toEqual({ hora: '08:30', slot: null })
  })
  it('no confunde un callback con el otro', () => {
    expect(parseMedCallback(medAllCallbackData('22:00'))).toBeNull()
    expect(parseMedAllCallback(medCallbackData('x'))).toBeNull()
  })
  it('ignora callbacks ajenos y basura', () => {
    for (const v of ['habit:123', 'feedback:up', '', null, undefined, 'med:', 'medall:', 'medall:99:99']) {
      expect(parseMedCallback(v)?.itemId ?? null).not.toBe('')
      expect(parseMedAllCallback(v)).toBeNull()
    }
    expect(parseMedCallback('med:')).toBeNull()
  })
  it('rechaza horas imposibles', () => {
    expect(parseMedAllCallback('medall:2560')).toBeNull()
    expect(parseMedAllCallback('medall:2399')).toBeNull()
    expect(parseMedAllCallback('medall:2359')).toEqual({ hora: '23:59', slot: null })
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
    // El texto cambió el 6-ago-2026 de `✅ Orfenadrina` a `Marcar: Orfenadrina`:
    // Aaron creyó que SIR le había marcado un hábito solo porque el botón con ✅ se
    // lee igual que un recibo de algo ya hecho. El ✅/✓ queda para lo YA registrado.
    expect(f[0][0].text).toBe('Marcar: Orfenadrina')
    expect(f[2][0].text).toBe('Marcar todas (2)')
  })

  it('con UNA sola pendiente no ofrece "Todas": sería ruido', () => {
    const f = botonesDeToma([med()], '22:00')
    expect(f).toHaveLength(1)
    expect(f.flat().some((b) => b.text.includes('Todas'))).toBe(false)
  })

  it('lo ya tomado hoy se marca con ✓ y no cuenta para "Todas"', () => {
    const f = botonesDeToma([
      med({ yaRegistrada: true }),
      med({ itemId: 'b', medName: 'Etoricoxib', yaRegistrada: true }),
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
    const t = textoDeToma([med({ yaRegistrada: true })], '22:00')
    expect(t).toContain('ya registraste todo')
    expect(t).not.toContain('Toca lo que')
  })
  it('no muestra los ya tomados en la lista de pendientes', () => {
    const t = textoDeToma([med({ yaRegistrada: true }), med({ itemId: 'b', medName: 'Clonazepam', dose: '2 mg' })], '22:00')
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

// ═══════════════════════════════════════════════════════════════════════════
// EL RECLAMO DEL 4-ago-2026
//
// A las 06:32 de la mañana le llegó "💊 Toma de las 22:00 … Toca lo que ya
// tomaste". Aaron: "qué sentido tiene que me pregunte en la mañana si las acabo
// de tomar si el objetivo es tomarlas en la noche. A menos que la pregunta sea
// si las tomé anoche, pero igual no es muy bueno porque podría olvidarme".
//
// Una hora sin día no se puede interpretar — y el día SIEMPRE estuvo en el id.
// ═══════════════════════════════════════════════════════════════════════════

describe('fechaDeRecordatorioDeToma — el día que el id siempre trajo', () => {
  it('saca la fecha del id real de producción', () => {
    expect(fechaDeRecordatorioDeToma('rem_med_2026-08-04_2200')).toBe('2026-08-04')
  })
  it('mismo criterio que la hora: solo ids de toma', () => {
    expect(fechaDeRecordatorioDeToma('rem_labs_neuro_orden')).toBeNull()
    expect(fechaDeRecordatorioDeToma('rem_ipd_ayuno_20260806')).toBeNull()
    expect(fechaDeRecordatorioDeToma('rem_med_no-es-fecha_2200')).toBeNull()
    expect(fechaDeRecordatorioDeToma('rem_med_2026-08-04_2560')).toBeNull()
    expect(fechaDeRecordatorioDeToma(null)).toBeNull()
    expect(fechaDeRecordatorioDeToma(undefined)).toBeNull()
  })
  it('la hora y la fecha salen del MISMO id sin contradecirse', () => {
    const id = 'rem_med_2026-08-04_2200'
    expect(horaDeRecordatorioDeToma(id)).toBe('22:00')
    expect(fechaDeRecordatorioDeToma(id)).toBe('2026-08-04')
  })
})

describe('cuandoDeLaToma — distingue avisar de preguntar', () => {
  it('la toma de hoy es "hoy"', () => {
    expect(cuandoDeLaToma('2026-08-04', '2026-08-04')).toBe('hoy')
  })
  it('la de ayer es "anoche" — el caso que Aaron nombró', () => {
    expect(cuandoDeLaToma('2026-08-03', '2026-08-04')).toBe('anoche')
  })
  it('más vieja que ayer es "atrasada"', () => {
    expect(cuandoDeLaToma('2026-07-30', '2026-08-04')).toBe('atrasada')
  })
  it('cruza el mes sin equivocarse', () => {
    expect(cuandoDeLaToma('2026-07-31', '2026-08-01')).toBe('anoche')
  })
  it('una toma futura se trata como la de "hoy" del día que toque', () => {
    expect(cuandoDeLaToma('2026-08-05', '2026-08-04')).toBe('hoy')
  })
  it('sin fecha devuelve null y el texto queda como antes (sin día)', () => {
    expect(cuandoDeLaToma(null, '2026-08-04')).toBeNull()
    expect(cuandoDeLaToma('basura', '2026-08-04')).toBeNull()
    expect(cuandoDeLaToma('2026-08-04', 'basura')).toBeNull()
  })
})

describe('textoDeToma — avisar (futuro) y preguntar (pasado) son mensajes distintos', () => {
  const meds = [
    { itemId: 'a', medName: 'Topiramato', dose: '100 mg', yaRegistrada: false },
    { itemId: 'b', medName: 'Clonazepam', dose: '2 mg', yaRegistrada: false },
  ]

  it('la de HOY no dice "ya tomaste" — todavía no pasó', () => {
    const t = textoDeToma(meds, '22:00', 'hoy')
    expect(t).toContain('Toma de HOY a las 22:00')
    expect(t).toContain('Cuando la tomes')
    expect(t).not.toContain('ya tomaste')
  })

  it('la de ANOCHE es una PREGUNTA, que es lo que Aaron pedía distinguir', () => {
    const t = textoDeToma(meds, '22:00', 'anoche')
    expect(t).toContain('¿Tomaste la de ANOCHE (22:00)?')
    expect(t).toContain('Si la tomaste')
  })

  it('una atrasada lo dice sin acusar', () => {
    expect(textoDeToma(meds, '22:00', 'atrasada')).toContain('Quedó sin registrar')
  })

  it('sin `cuando` queda EXACTAMENTE el texto viejo (compatibilidad)', () => {
    expect(textoDeToma(meds, '22:00')).toBe(textoDeToma(meds, '22:00', null))
    expect(textoDeToma(meds, '22:00')).toContain('Toma de las 22:00')
  })

  it('todo registrado: felicita igual, sin importar el día', () => {
    const ya = [{ itemId: 'a', medName: 'Topiramato', dose: '100 mg', yaRegistrada: true }]
    for (const c of ['hoy', 'anoche', 'atrasada', null] as const) {
      expect(textoDeToma(ya, '22:00', c)).toContain('ya registraste todo')
    }
  })

  it('siempre nombra los medicamentos con su dosis', () => {
    for (const c of ['hoy', 'anoche', 'atrasada', null] as const) {
      const t = textoDeToma(meds, '22:00', c)
      expect(t).toContain('Topiramato 100 mg')
      expect(t).toContain('Clonazepam 2 mg')
    }
  })
})

// ═══ LA DOSIS TIENE FECHA Y HORA (6-ago-2026) ════════════════════════════════
//
// Aaron: *"hoy solo tomé clonazepam y topiramato, le marqué pero no parece que haya
// cambiado algo, no sé si quedó bien registrado"*. La cadena medida fue: a las 09:31
// tocó "Todas" respondiendo al aviso de la noche del 5, se guardó como del día 6, y a
// las 21:22 SIR le dijo "ya registraste todo lo de esta toma" con las 4 en ✓ sin que
// hubiera tomado nada. El candado era por (ítem, DÍA); ahora es por DOSIS.
describe('slotDeDosis', () => {
  it('arma la etiqueta de la dosis en hora de Lima, sin offset', () => {
    expect(slotDeDosis('2026-08-03', '08:00')).toBe('2026-08-03T08:00')
    expect(slotDeDosis('2026-08-06', '22:00')).toBe('2026-08-06T22:00')
  })

  it('null si falta la fecha o la hora, o si no son válidas', () => {
    expect(slotDeDosis(null, '08:00')).toBeNull()
    expect(slotDeDosis('2026-08-03', null)).toBeNull()
    expect(slotDeDosis('2026-08-03', '25:00')).toBeNull()
    expect(slotDeDosis('2026-08-03', '08:75')).toBeNull()
    expect(slotDeDosis('03-08-2026', '08:00')).toBeNull()
    expect(slotDeDosis('', '')).toBeNull()
  })
})

describe('el callback lleva la dosis, y acepta los viejos', () => {
  const SLOT = '2026-08-05T22:00'

  it('ida y vuelta con slot', () => {
    expect(parseMedCallback(medCallbackData('presci_neuro_topiramato', SLOT)))
      .toEqual({ itemId: 'presci_neuro_topiramato', slot: SLOT })
    expect(parseMedAllCallback(medAllCallbackData('22:00', SLOT)))
      .toEqual({ hora: '22:00', slot: SLOT })
  })

  // OBLIGATORIO: los avisos del 3 al 6 de agosto siguen vivos en el chat de Aaron con
  // los callbacks viejos. Si dejaran de parsear, cada uno de esos botones moriría en
  // silencio — que es exactamente el reclamo del que venimos.
  it('RETROCOMPAT: los callbacks viejos siguen funcionando, con slot null', () => {
    expect(parseMedCallback('med:presci_clonazepam')).toEqual({ itemId: 'presci_clonazepam', slot: null })
    expect(parseMedAllCallback('medall:2200')).toEqual({ hora: '22:00', slot: null })
  })

  it('cabe en los 64 bytes con el itemId más largo de producción', () => {
    const largo = medCallbackData('presci_emerg_paracetramadol', SLOT)
    expect(Buffer.byteLength(largo, 'utf8')).toBeLessThanOrEqual(64)
    expect(parseMedCallback(largo)?.slot).toBe(SLOT)
    expect(Buffer.byteLength(medAllCallbackData('22:00', SLOT), 'utf8')).toBeLessThanOrEqual(64)
  })

  it('si un slot inválido se cuela, se cae al callback viejo en vez de romper', () => {
    const d = medCallbackData('presci_clonazepam', 'no-es-slot')
    expect(d).toBe('med:presci_clonazepam')
    expect(parseMedCallback(d)).toEqual({ itemId: 'presci_clonazepam', slot: null })
  })

  it('un slot con hora imposible se rechaza entero, no a medias', () => {
    expect(parseMedCallback('med:2026-08-05T25:00:presci_clonazepam')).toBeNull()
    expect(parseMedAllCallback('medall:2026-08-05T24:61')).toBeNull()
  })
})

describe('los botones dicen la ACCIÓN, no un recibo', () => {
  // Aaron creyó que SIR le había marcado "Tender la cama" solo, porque el botón
  // `✅ Tender la cama` se lee igual que algo ya hecho. Acá el ✅ queda para lo YA
  // registrado (✓) y el pendiente dice qué hace el tap.
  it('lo pendiente dice "Marcar:", lo registrado lleva ✓', () => {
    const filas = botonesDeToma([
      { itemId: 'a', medName: 'Topiramato', dose: '100 mg', yaRegistrada: false },
      { itemId: 'b', medName: 'Clonazepam', dose: '2 mg', yaRegistrada: true },
    ], '22:00', '2026-08-06T22:00')
    expect(filas[0][0].text).toBe('Marcar: Topiramato')
    expect(filas[1][0].text).toBe('✓ Clonazepam')
  })

  it('los botones propagan el slot', () => {
    const filas = botonesDeToma([
      { itemId: 'a', medName: 'Topiramato', dose: '100 mg', yaRegistrada: false },
      { itemId: 'b', medName: 'Clonazepam', dose: '2 mg', yaRegistrada: false },
    ], '22:00', '2026-08-06T22:00')
    expect(parseMedCallback(filas[0][0].callbackData)?.slot).toBe('2026-08-06T22:00')
    // La fila de "todas" también.
    expect(parseMedAllCallback(filas[2][0].callbackData)?.slot).toBe('2026-08-06T22:00')
  })

  it('sin slot los botones siguen saliendo (comportamiento viejo)', () => {
    const filas = botonesDeToma([{ itemId: 'a', medName: 'Topiramato', dose: '100 mg', yaRegistrada: false }], '22:00')
    expect(filas).toHaveLength(1)
    expect(parseMedCallback(filas[0][0].callbackData)).toEqual({ itemId: 'a', slot: null })
  })
})
