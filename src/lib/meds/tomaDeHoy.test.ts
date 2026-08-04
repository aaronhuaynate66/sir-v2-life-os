// SIR V2 — Tests de "¿qué tomo AHORA y por qué?".
//
// El reclamo que lo motivó (Aaron, 4-ago-2026, viendo /salud en producción):
// "ha quedado horroroso, cero UX UI y orden, no se entiende para nada lo que tomo
// ni para qué ni por qué". La HORA de la toma existía en la tabla desde #1087 y el
// endpoint nunca la seleccionaba, así que la pantalla solo decía "cada 24 h".
import { describe, it, expect } from 'vitest'
import { bloquesDeToma, aDemanda, minutosDeHora, type ItemDeToma } from '@/lib/meds/tomaDeHoy'

const med = (o: Partial<ItemDeToma> & { itemId: string; medName: string }): ItemDeToma => ({
  dose: null, schedule: [], indication: null, pendientesHoy: null, tomadasHoy: 0,
  terminado: false, reason: null, diagnosis: null, status: 'activa', ...o,
})

// Su esquema real del 4-ago: 4 medicamentos a las 22:00, de TRES recetas distintas.
const TOPIRAMATO = med({ itemId: 't', medName: 'Topiramato', dose: '100 mg', schedule: ['22:00'], reason: 'Migraña sin aura', diagnosis: 'G43.0 — Migraña sin aura' })
const CLONAZEPAM = med({ itemId: 'c', medName: 'Clonazepam', dose: '2 mg', schedule: ['22:00'], reason: 'Clonazepam nocturno' })
const ORFENADRINA = med({ itemId: 'o', medName: 'Orfenadrina', dose: '100 mg', schedule: ['22:00'], reason: 'Trastorno de la ATM' })
const ERGONEX = med({ itemId: 'e', medName: 'Ergonex Plus', schedule: [], indication: '1 TAB AL COMENZAR EL DOLOR' })

describe('minutosDeHora', () => {
  it('parsea HH:MM', () => {
    expect(minutosDeHora('22:00')).toBe(1320)
    expect(minutosDeHora('07:30')).toBe(450)
    expect(minutosDeHora('00:00')).toBe(0)
  })
  it('rechaza basura sin explotar', () => {
    for (const x of ['', '7:30', '22:00:00', '25:00', '22:99', 'nope']) {
      expect(minutosDeHora(x)).toBe(-1)
    }
  })
})

describe('bloquesDeToma — agrupa por HORA, no por receta', () => {
  it('el caso real: 4 medicamentos de 3 recetas distintas caen en UN bloque de 22:00', () => {
    // Esto es lo que la vista por receta hacía invisible: agrupado por receta, que
    // los cuatro coincidan a la misma hora no se ve en ninguna parte.
    const b = bloquesDeToma([TOPIRAMATO, CLONAZEPAM, ORFENADRINA], '21:55')
    expect(b).toHaveLength(1)
    expect(b[0].hora).toBe('22:00')
    expect(b[0].meds.map((m) => m.medName)).toEqual(['Topiramato', 'Clonazepam', 'Orfenadrina'])
  })

  it('a las 21:55 la de 22:00 es LA PRÓXIMA y no está pasada', () => {
    const b = bloquesDeToma([TOPIRAMATO], '21:55')
    expect(b[0].proxima).toBe(true)
    expect(b[0].pasada).toBe(false)
  })

  it('a las 23:30 ya pasó, y NO se marca como próxima: eso mentiría sobre el día', () => {
    const b = bloquesDeToma([TOPIRAMATO], '23:30')
    expect(b[0].pasada).toBe(true)
    expect(b[0].proxima).toBe(false)
  })

  it('con varias horas, la próxima es la primera que aún no pasó', () => {
    const manana = med({ itemId: 'm', medName: 'Mañanero', schedule: ['08:00'] })
    const b = bloquesDeToma([manana, TOPIRAMATO], '12:00')
    expect(b.map((x) => x.hora)).toEqual(['08:00', '22:00']) // ordenado por hora
    expect(b[0].pasada).toBe(true)
    expect(b[0].proxima).toBe(false)
    expect(b[1].proxima).toBe(true)
  })

  it('un medicamento con DOS horas aparece en los dos bloques', () => {
    const dosVeces = med({ itemId: 'd', medName: 'Dos veces', schedule: ['08:00', '20:00'] })
    const b = bloquesDeToma([dosVeces], '12:00')
    expect(b).toHaveLength(2)
    expect(b[0].meds[0].medName).toBe('Dos veces')
    expect(b[1].meds[0].medName).toBe('Dos veces')
  })

  it('lo terminado y lo que no está activo NO aparece: es histórico, no de hoy', () => {
    expect(bloquesDeToma([med({ itemId: 'x', medName: 'X', schedule: ['22:00'], terminado: true })], '10:00')).toHaveLength(0)
    expect(bloquesDeToma([med({ itemId: 'y', medName: 'Y', schedule: ['22:00'], status: 'completada' })], '10:00')).toHaveLength(0)
    expect(bloquesDeToma([med({ itemId: 'z', medName: 'Z', schedule: ['22:00'], status: 'suspendida' })], '10:00')).toHaveLength(0)
  })

  it('sin hora no entra a los bloques (no se le inventa un horario)', () => {
    expect(bloquesDeToma([ERGONEX], '10:00')).toHaveLength(0)
  })

  it('una hora corrupta se descarta sin tumbar el resto', () => {
    const roto = med({ itemId: 'r', medName: 'Roto', schedule: ['nope', '22:00'] })
    const b = bloquesDeToma([roto], '10:00')
    expect(b).toHaveLength(1)
    expect(b[0].hora).toBe('22:00')
  })

  it('vacío y basura no rompen', () => {
    expect(bloquesDeToma([], '10:00')).toEqual([])
    expect(bloquesDeToma(null as unknown as ItemDeToma[], '10:00')).toEqual([])
    expect(() => bloquesDeToma([TOPIRAMATO], 'basura')).not.toThrow()
  })
})

describe('aDemanda — un rescate no tiene horario', () => {
  it('el Ergonex (ergotamina) va aparte, sin hora fingida', () => {
    const d = aDemanda([TOPIRAMATO, ERGONEX])
    expect(d.map((m) => m.medName)).toEqual(['Ergonex Plus'])
  })
  it('no incluye lo terminado ni lo suspendido', () => {
    expect(aDemanda([med({ itemId: 'a', medName: 'A', terminado: true })])).toHaveLength(0)
    expect(aDemanda([med({ itemId: 'b', medName: 'B', status: 'completada' })])).toHaveLength(0)
  })
  it('vacío y basura no rompen', () => {
    expect(aDemanda([])).toEqual([])
    expect(aDemanda(null as unknown as ItemDeToma[])).toEqual([])
  })
})
