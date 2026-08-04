import { describe, it, expect } from 'vitest'

import {
  eventosProximosLine, cuando, VENTANA_DIAS,
  eventosProximosIdentity, hayEventoInminente, eventosEnVentana,
  type EventoProximo,
} from './eventosProximos'

const HOY = '2026-07-30' // jueves

describe('eventosProximosLine — el caso REAL que lo motivó', () => {
  it('la boda de Laura del sábado SÍ aparece', () => {
    // Aaron, 30-jul: "Laura me escribió diciéndome que este sábado es su matrimonio
    // religioso, y no veo ninguna alerta". El evento estaba cargado desde antes; el
    // brief solo leía personal_events por el cruce del ciclo.
    const linea = eventosProximosLine([
      { date: '2026-08-01', title: 'Boda religiosa de Laura Alfaro', personName: 'Laura Alfaro' },
    ], HOY)!
    expect(linea).toContain('Boda religiosa de Laura Alfaro')
    expect(linea).toContain('Laura Alfaro')
    expect(linea).toContain('el sábado')
  })

  it('dice el DÍA de la semana, no "en 2 días" (ubica sin contar)', () => {
    const linea = eventosProximosLine([{ date: '2026-08-01', title: 'X' }], HOY)!
    expect(linea).toContain('el sábado')
    expect(linea).not.toContain('en 2 días')
  })
})

describe('cuando', () => {
  it('hoy y mañana se dicen con palabras, no con fecha', () => {
    expect(cuando(0, HOY)).toBe('hoy')
    expect(cuando(1, '2026-07-31')).toBe('mañana')
  })

  it('dentro de la semana usa el día', () => {
    expect(cuando(2, '2026-08-01')).toBe('el sábado')
    expect(cuando(5, '2026-08-04')).toBe('el martes')
  })

  it('más allá de la ventana cuenta días', () => {
    expect(cuando(20, '2026-08-19')).toBe('en 20 días')
  })
})

describe('eventosProximosLine — qué entra y qué no', () => {
  it('lo de HOY entra', () => {
    expect(eventosProximosLine([{ date: HOY, title: 'Control maxilofacial' }], HOY))
      .toContain('hoy')
  })

  it('lo PASADO no entra: un evento de ayer no es un recordatorio', () => {
    expect(eventosProximosLine([{ date: '2026-07-29', title: 'Algo de ayer' }], HOY)).toBeNull()
  })

  it(`fuera de los ${VENTANA_DIAS} días no entra`, () => {
    expect(eventosProximosLine([{ date: '2026-08-20', title: 'Lejano' }], HOY)).toBeNull()
  })

  it('el borde de la ventana SÍ entra', () => {
    const borde = new Date(Date.parse(`${HOY}T00:00:00Z`) + VENTANA_DIAS * 86_400_000)
      .toISOString().slice(0, 10)
    expect(eventosProximosLine([{ date: borde, title: 'Justo en el borde' }], HOY)).toBeTruthy()
  })

  it('ordena por cercanía', () => {
    const linea = eventosProximosLine([
      { date: '2026-08-04', title: 'Lejano' },
      { date: '2026-07-31', title: 'Cercano' },
    ], HOY)!
    expect(linea.indexOf('Cercano')).toBeLessThan(linea.indexOf('Lejano'))
  })

  it('con más de 2 cuenta los que sobran en vez de volcarlos', () => {
    const linea = eventosProximosLine([
      { date: '2026-07-31', title: 'Uno' }, { date: '2026-08-01', title: 'Dos' },
      { date: '2026-08-02', title: 'Tres' }, { date: '2026-08-03', title: 'Cuatro' },
    ], HOY)!
    expect(linea).toContain('Uno')
    expect(linea).toContain('Dos')
    expect(linea).not.toContain('Tres')
    expect(linea).toContain('y 2 más esta semana')
  })

  it('sin persona no inventa paréntesis vacío', () => {
    const linea = eventosProximosLine([{ date: HOY, title: 'Control médico' }], HOY)!
    expect(linea).not.toContain('()')
  })

  it('vacío, fechas basura y títulos vacíos no rompen', () => {
    expect(eventosProximosLine([], HOY)).toBeNull()
    expect(eventosProximosLine(null as unknown as EventoProximo[], HOY)).toBeNull()
    expect(eventosProximosLine([{ date: 'no-es-fecha', title: 'X' }], HOY)).toBeNull()
    expect(eventosProximosLine([{ date: HOY, title: '' }], HOY)).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// IDENTIDAD DE LA SEÑAL — el bug del 4-ago-2026
//
// El slot vivía en AGGREGATE_SLOTS, así que su identidad para el auto-snooze era
// el slot (clave fija). Se durmió por racha el 3-ago y con SNOOZE_DAYS=14 no
// despertaba hasta el 17 — con la reunión en el Comando General del 4-ago, el
// examen del IPD del 7 (ayuno de 8 h) y el aniversario con Diana del 13 adentro.
// ═══════════════════════════════════════════════════════════════════════════

describe('eventosProximosIdentity — distingue "un día después" de "evento nuevo"', () => {
  const boda: EventoProximo = { date: '2026-08-01', title: 'Boda religiosa de Laura Alfaro' }

  it('LA CLAVE DEL BUG: el paso del tiempo NO cambia la identidad', () => {
    // El texto sí cambia ("el sábado" → "mañana" → "hoy"), y hashearlo rompía la
    // racha todos los días. La identidad tiene que sobrevivir a eso, o el
    // auto-snooze nunca se dispararía.
    const jueves = eventosProximosIdentity([boda], '2026-07-30')
    const viernes = eventosProximosIdentity([boda], '2026-07-31')
    const sabado = eventosProximosIdentity([boda], '2026-08-01')
    expect(eventosProximosLine([boda], '2026-07-30')).not.toBe(eventosProximosLine([boda], '2026-08-01'))
    expect(jueves).toBe(viernes)
    expect(viernes).toBe(sabado)
  })

  it('LA OTRA MITAD DEL BUG: un evento NUEVO sí cambia la identidad', () => {
    // Esto es lo que la clave fija por slot no podía ver, y por eso la reunión
    // en el Comando General entró a un slot dormido y murió ahí.
    const solo = eventosProximosIdentity([boda], '2026-07-30')
    const conReunion = eventosProximosIdentity([
      boda,
      { date: '2026-07-31', title: 'Reunión en el Comando General (Delicia + Tte. Llatance)' },
    ], '2026-07-30')
    expect(conReunion).not.toBe(solo)
  })

  it('el mismo título en otra fecha es OTRO compromiso', () => {
    const a = eventosProximosIdentity([{ date: '2026-08-03', title: 'Control maxilofacial' }], '2026-08-02')
    const b = eventosProximosIdentity([{ date: '2026-08-20', title: 'Control maxilofacial' }], '2026-08-19')
    expect(a).not.toBe(b)
  })

  it('cambia si cambia CUÁNTOS quedaron sin nombrar (la línea también lo dice)', () => {
    const tres = [boda, { date: '2026-08-02', title: 'Dos' }, { date: '2026-08-03', title: 'Tres' }]
    const cuatro = [...tres, { date: '2026-08-04', title: 'Cuatro' }]
    expect(eventosProximosIdentity(tres, '2026-07-30'))
      .not.toBe(eventosProximosIdentity(cuatro, '2026-07-30'))
  })

  it('un evento que se fue de la ventana no arrastra la identidad vieja', () => {
    // 30-jul mira hasta el 6-ago; 31-jul ya no ve nada del 30.
    const pasado = eventosProximosIdentity([{ date: '2026-07-30', title: 'Algo de hoy' }, boda], '2026-07-30')
    const despues = eventosProximosIdentity([{ date: '2026-07-30', title: 'Algo de hoy' }, boda], '2026-07-31')
    expect(pasado).not.toBe(despues)
  })

  it('no depende del orden en que vengan de la base', () => {
    const evs = [{ date: '2026-08-02', title: 'B' }, boda]
    expect(eventosProximosIdentity(evs, '2026-07-30'))
      .toBe(eventosProximosIdentity([...evs].reverse(), '2026-07-30'))
  })

  it('ignora acentos, mayúsculas y puntuación del título', () => {
    expect(eventosProximosIdentity([{ date: '2026-08-01', title: 'Reunión, en el COMANDO General' }], '2026-07-30'))
      .toBe(eventosProximosIdentity([{ date: '2026-08-01', title: 'reunion en el comando general' }], '2026-07-30'))
  })

  it('null cuando la línea también es null (no se inventa identidad sin señal)', () => {
    expect(eventosProximosIdentity([], HOY)).toBeNull()
    expect(eventosProximosIdentity([{ date: '2026-08-20', title: 'Lejano' }], HOY)).toBeNull()
    expect(eventosProximosIdentity(null as unknown as EventoProximo[], HOY)).toBeNull()
    expect(eventosProximosLine([{ date: '2026-08-20', title: 'Lejano' }], HOY)).toBeNull()
  })
})

describe('hayEventoInminente — lo que no se calla nunca', () => {
  it('la reunión del Comando General de HOY es inminente', () => {
    expect(hayEventoInminente([{ date: HOY, title: 'Reunión en el Comando General' }], HOY)).toBe(true)
  })

  it('el examen del IPD de MAÑANA es inminente (ayuno de 8 h: avisar tarde es no avisar)', () => {
    expect(hayEventoInminente([{ date: '2026-07-31', title: 'Examen médico EPP — IPD' }], HOY)).toBe(true)
  })

  it('en 2 días todavía no: ahí el anti-repetición sí puede opinar', () => {
    expect(hayEventoInminente([{ date: '2026-08-01', title: 'Boda' }], HOY)).toBe(false)
  })

  it('basta UNO inminente aunque el resto esté lejos', () => {
    expect(hayEventoInminente([
      { date: '2026-08-05', title: 'Lejano' },
      { date: HOY, title: 'Hoy' },
    ], HOY)).toBe(true)
  })

  it('lo de ayer no cuenta (ya no se puede preparar)', () => {
    expect(hayEventoInminente([{ date: '2026-07-29', title: 'Ayer' }], HOY)).toBe(false)
  })

  it('vacío y basura no rompen', () => {
    expect(hayEventoInminente([], HOY)).toBe(false)
    expect(hayEventoInminente(null as unknown as EventoProximo[], HOY)).toBe(false)
    expect(hayEventoInminente([{ date: 'no-es-fecha', title: 'X' }], HOY)).toBe(false)
  })
})

describe('eventosEnVentana — la línea y la identidad miran el MISMO conjunto', () => {
  it('lo que entra a la ventana es exactamente lo que la línea puede nombrar', () => {
    // Si estas dos se calcularan por separado, un día divergirían y la identidad
    // dejaría de describir el texto — el modo de falla que causó todo esto.
    const evs: EventoProximo[] = [
      { date: '2026-07-29', title: 'Ayer, fuera' },
      { date: HOY, title: 'Hoy, dentro' },
      { date: '2026-08-06', title: 'Borde, dentro' },
      { date: '2026-08-07', title: 'Pasado el borde, fuera' },
    ]
    const dentro = eventosEnVentana(evs, HOY)
    expect(dentro.map((x) => x.e.title)).toEqual(['Hoy, dentro', 'Borde, dentro'])
    const linea = eventosProximosLine(evs, HOY)!
    expect(linea).toContain('Hoy, dentro')
    expect(linea).not.toContain('Ayer, fuera')
    expect(linea).not.toContain('Pasado el borde, fuera')
    expect(dentro.length).toBe(2)
    // El borde se afirma contra la constante, no contra un número a mano: si
    // alguien mueve VENTANA_DIAS, este test tiene que seguir midiendo el borde.
    expect(dentro[dentro.length - 1].dias).toBe(VENTANA_DIAS)
  })
})
