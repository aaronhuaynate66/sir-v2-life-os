import { describe, it, expect } from 'vitest'

import { eventosProximosLine, cuando, VENTANA_DIAS, type EventoProximo } from './eventosProximos'

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
