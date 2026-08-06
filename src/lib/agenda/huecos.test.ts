// SIR V2 — Tests de los huecos libres.
//
// Todas las fechas son de agosto de 2026 y las horas se razonan en LIMA (−05:00).
// Referencias útiles: 2026-08-06 es JUEVES, el 08 SÁBADO y el 09 DOMINGO.
import { describe, expect, it } from 'vitest'

import { huecosLibres, type EventoOcupado } from './huecos'

/** 'YYYY-MM-DD HH:MM' de Lima → ISO UTC. */
const lima = (dia: string, hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(Date.parse(`${dia}T00:00:00Z`) + (h + 5) * 3_600_000 + m * 60_000).toISOString()
}
// Jueves 6-ago, 10:00 de Lima.
const AHORA = Date.parse(lima('2026-08-06', '10:00'))
const ev = (dia: string, ini: string, fin: string): EventoOcupado =>
  ({ start: lima(dia, ini), end: lima(dia, fin), allDay: false })

describe('propone en franjas razonables', () => {
  it('entre semana, de noche — no un martes a las 9 de la mañana', () => {
    const h = huecosLibres([], AHORA, { max: 1 })
    expect(h).toHaveLength(1)
    expect(h[0].diaLima).toBe('2026-08-07') // viernes
    expect(Number(h[0].horaLima.slice(0, 2))).toBeGreaterThanOrEqual(19)
    expect(Number(h[0].horaLima.slice(0, 2))).toBeLessThan(22)
  })

  it('el fin de semana también al mediodía', () => {
    // Se pide desde el viernes para que el sábado entre en la ventana.
    const h = huecosLibres([], AHORA, { max: 3, dias: 3 })
    const sabado = h.find((x) => x.diaLima === '2026-08-08')
    expect(sabado).toBeDefined()
    expect(Number(sabado!.horaLima.slice(0, 2))).toBeGreaterThanOrEqual(11)
  })

  it('empieza MAÑANA: un compromiso de hace días no se resuelve para dentro de 2 horas', () => {
    const h = huecosLibres([], AHORA, { max: 5, dias: 7 })
    expect(h.every((x) => x.diaLima > '2026-08-06')).toBe(true)
  })
})

describe('respeta lo que ya está ocupado', () => {
  it('no propone encima de un evento', () => {
    // Viernes ocupado toda la franja de la noche.
    const h = huecosLibres([ev('2026-08-07', '18:00', '23:00')], AHORA, { max: 1, dias: 3 })
    expect(h).toHaveLength(1)
    expect(h[0].diaLima).not.toBe('2026-08-07')
  })

  it('un evento sin fin declarado se asume de una hora, no de cero', () => {
    const sinFin: EventoOcupado = { start: lima('2026-08-07', '19:00'), allDay: false }
    const h = huecosLibres([sinFin], AHORA, { max: 1, dias: 2, minutos: 90 })
    // 19:00–20:00 ocupado ⇒ el hueco de 90 min no puede arrancar 19:00 ni 19:30.
    if (h.length > 0 && h[0].diaLima === '2026-08-07') {
      expect(Number(h[0].horaLima.replace(':', '.'))).toBeGreaterThanOrEqual(20)
    }
  })

  it('los eventos de TODO EL DÍA no bloquean: son marcadores, no ocupan tiempo', () => {
    const aniversario: EventoOcupado = { start: '2026-08-07', allDay: true }
    const h = huecosLibres([aniversario], AHORA, { max: 1, dias: 2 })
    expect(h).toHaveLength(1)
    expect(h[0].diaLima).toBe('2026-08-07')
  })
})

describe('la forma de las opciones', () => {
  it('como máximo UNO por día: tres horarios del mismo jueves no son tres opciones', () => {
    const h = huecosLibres([], AHORA, { max: 4, dias: 7 })
    expect(new Set(h.map((x) => x.diaLima)).size).toBe(h.length)
  })

  it('respeta el máximo pedido', () => {
    expect(huecosLibres([], AHORA, { max: 2, dias: 7 })).toHaveLength(2)
    expect(huecosLibres([], AHORA, { max: 1, dias: 7 })).toHaveLength(1)
  })

  it('la duración se refleja en el fin', () => {
    const h = huecosLibres([], AHORA, { max: 1, minutos: 60 })
    expect(Date.parse(h[0].fin) - Date.parse(h[0].inicio)).toBe(60 * 60_000)
  })

  it('no revienta con basura ni con agenda vacía', () => {
    expect(() => huecosLibres(null as unknown as EventoOcupado[], AHORA)).not.toThrow()
    expect(huecosLibres([{ start: 'no-es-fecha', allDay: false }], AHORA, { max: 1 }).length).toBe(1)
  })

  it('si TODO está ocupado devuelve vacío — y eso NO significa "no tiene tiempo"', () => {
    const todo: EventoOcupado[] = []
    for (let d = 6; d <= 20; d++) {
      const dia = `2026-08-${String(d).padStart(2, '0')}`
      todo.push(ev(dia, '00:00', '23:59'))
    }
    expect(huecosLibres(todo, AHORA, { max: 2, dias: 7 })).toEqual([])
  })
})
