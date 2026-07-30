import { describe, it, expect } from 'vitest'

import { evaluarPrecondiciones, lineaTrabada, type PasoPlan } from './precondicion'

const HOY = '2026-07-30'
const p = (o: Partial<PasoPlan> & { id: string; title: string }): PasoPlan => ({
  objectiveId: 'g1', parentId: 'kr1', status: 'pendiente', ...o,
})

describe('evaluarPrecondiciones — el caso REAL que lo motivó', () => {
  /** La cadena del objetivo de ingresos, tal como estaba el 30-jul. */
  const CADENA: PasoPlan[] = [
    p({ id: 'propuesta', title: 'Enviar propuesta de consultoría a 5 leads', sortOrder: 0, targetDate: '2026-06-24' }),
    p({ id: 'contrato', title: 'Cerrar el primer contrato de consultoría', sortOrder: 1, targetDate: '2026-07-08' }),
    p({ id: 'facturar', title: 'Facturar y cobrar el primer mes de consultoría', sortOrder: 2, targetDate: '2026-07-31' }),
  ]

  it('"facturar" NO es accionable: el contrato nunca se cerró', () => {
    const v = evaluarPrecondiciones(CADENA, HOY)
    expect(v.get('facturar')!.accionable).toBe(false)
    expect(v.get('facturar')!.motivo).toBe('anterior_vencido')
  })

  it('señala el paso MÁS VIEJO, que es donde el plan se detuvo', () => {
    // Trabado por "contrato" (8-jul) y por "propuesta" (24-jun). El útil es el
    // segundo: es ahí donde hay que empezar, no en el intermedio.
    const v = evaluarPrecondiciones(CADENA, HOY)
    expect(v.get('facturar')!.trabadoPor?.id).toBe('propuesta')
  })

  it('el primero de la cadena SÍ es accionable — no se traba a sí mismo', () => {
    const v = evaluarPrecondiciones(CADENA, HOY)
    expect(v.get('propuesta')!.accionable).toBe(true)
  })

  it('si el anterior se CIERRA, el siguiente se destraba', () => {
    const cerrado = CADENA.map((s) => (s.id === 'propuesta' || s.id === 'contrato' ? { ...s, status: 'hecho' } : s))
    expect(evaluarPrecondiciones(cerrado, HOY).get('facturar')!.accionable).toBe(true)
  })

  it('un anterior DESCARTADO tampoco traba (ya no es del plan)', () => {
    const desc = CADENA.map((s) => (s.id === 'propuesta' || s.id === 'contrato' ? { ...s, status: 'descartado' } : s))
    expect(evaluarPrecondiciones(desc, HOY).get('facturar')!.accionable).toBe(true)
  })
})

describe('evaluarPrecondiciones — NO tapar pendientes reales', () => {
  it('un anterior pendiente con fecha FUTURA no traba', () => {
    // La regla clave, y la razón de que no se use "el anterior bloquea al
    // siguiente" a secas: medido en el Mundial, las fechas NO son monótonas con
    // sort_order. El KR "Visa y viaje" tiene el orden 1 venciendo el 30-sep y el
    // orden 2 el 15-sep — con la regla ingenua, comprar el pasaje quedaría tapado
    // por tramitar la visa, que va DESPUÉS en el tiempo.
    const v = evaluarPrecondiciones([
      p({ id: 'visa', title: 'Tramitar visa de Arabia Saudita', sortOrder: 1, targetDate: '2026-09-30' }),
      p({ id: 'pasaje', title: 'Comprar pasaje a Dammam', sortOrder: 2, targetDate: '2026-09-15' }),
    ], HOY)
    expect(v.get('pasaje')!.accionable).toBe(true)
  })

  it('un anterior SIN FECHA no traba', () => {
    // Muchos key results y tareas no tienen fecha. Si la ausencia trabara, media
    // lista desaparecería por un dato que nunca se cargó.
    const v = evaluarPrecondiciones([
      p({ id: 'sinfecha', title: 'Armar presupuesto total', sortOrder: 0, targetDate: null }),
      p({ id: 'hoy', title: 'Reservar alojamiento', sortOrder: 1, targetDate: HOY }),
    ], HOY)
    expect(v.get('hoy')!.accionable).toBe(true)
  })

  it('un vencido de OTRO grupo no traba', () => {
    const v = evaluarPrecondiciones([
      p({ id: 'otroKR', title: 'Algo atrasado de otra parte', parentId: 'kr2', sortOrder: 0, targetDate: '2026-06-01' }),
      p({ id: 'mio', title: 'Lo mío de hoy', parentId: 'kr1', sortOrder: 5, targetDate: HOY }),
    ], HOY)
    expect(v.get('mio')!.accionable).toBe(true)
  })

  it('un vencido POSTERIOR en la secuencia no traba', () => {
    const v = evaluarPrecondiciones([
      p({ id: 'antes', title: 'Primero', sortOrder: 0, targetDate: HOY }),
      p({ id: 'despues', title: 'Segundo, atrasado', sortOrder: 1, targetDate: '2026-06-01' }),
    ], HOY)
    expect(v.get('antes')!.accionable).toBe(true)
  })

  it('el vencido de HOY no cuenta como vencido (vence hoy, no venció)', () => {
    const v = evaluarPrecondiciones([
      p({ id: 'a', title: 'Uno', sortOrder: 0, targetDate: HOY }),
      p({ id: 'b', title: 'Dos', sortOrder: 1, targetDate: HOY }),
    ], HOY)
    expect(v.get('b')!.accionable).toBe(true)
  })
})

describe('evaluarPrecondiciones — blocked_by declarado gana', () => {
  it('respeta la dependencia explícita aunque no haya vencimiento', () => {
    const v = evaluarPrecondiciones([
      p({ id: 'base', title: 'Conseguir el token', sortOrder: 9, targetDate: '2026-12-01' }),
      p({ id: 'dep', title: 'Cablear la integración', sortOrder: 0, targetDate: HOY, blockedBy: 'base' }),
    ], HOY)
    expect(v.get('dep')!.accionable).toBe(false)
    expect(v.get('dep')!.motivo).toBe('declarado')
    expect(v.get('dep')!.trabadoPor?.id).toBe('base')
  })

  it('acepta lista o id suelto (la columna está vacía: hay que tolerar las dos)', () => {
    const base = p({ id: 'base', title: 'Base', sortOrder: 0, targetDate: '2026-12-01' })
    for (const blockedBy of ['base', ['base'], ['base', 'inexistente']] as const) {
      const v = evaluarPrecondiciones([base, p({ id: 'x', title: 'X', sortOrder: 1, blockedBy: [...(Array.isArray(blockedBy) ? blockedBy : [blockedBy])] })], HOY)
      expect(v.get('x')!.accionable, JSON.stringify(blockedBy)).toBe(false)
    }
  })

  it('si el declarado ya está hecho, NO traba', () => {
    const v = evaluarPrecondiciones([
      p({ id: 'base', title: 'Base', status: 'hecho', sortOrder: 0 }),
      p({ id: 'dep', title: 'Dep', sortOrder: 1, targetDate: HOY, blockedBy: 'base' }),
    ], HOY)
    expect(v.get('dep')!.accionable).toBe(true)
  })

  it('un blocked_by que apunta a un id que no existe se ignora', () => {
    const v = evaluarPrecondiciones([p({ id: 'x', title: 'X', targetDate: HOY, blockedBy: 'fantasma' })], HOY)
    expect(v.get('x')!.accionable).toBe(true)
  })
})

describe('evaluarPrecondiciones — bordes', () => {
  it('lista vacía y basura no rompen', () => {
    expect(evaluarPrecondiciones([], HOY).size).toBe(0)
    expect(evaluarPrecondiciones(null as unknown as PasoPlan[], HOY).size).toBe(0)
  })

  it('sin sortOrder no se traba a nadie ni se deja trabar de más', () => {
    // Sin orden no hay "antes": los dos quedan accionables en vez de que uno
    // arrastre al otro por azar.
    const v = evaluarPrecondiciones([
      p({ id: 'a', title: 'A', sortOrder: null, targetDate: '2026-06-01' }),
      p({ id: 'b', title: 'B', sortOrder: null, targetDate: HOY }),
    ], HOY)
    expect(v.get('b')!.accionable).toBe(true)
  })

  it('sin parentId agrupa por objetivo', () => {
    const v = evaluarPrecondiciones([
      { id: 'a', title: 'A', objectiveId: 'g1', parentId: null, status: 'pendiente', sortOrder: 0, targetDate: '2026-06-01' },
      { id: 'b', title: 'B', objectiveId: 'g1', parentId: null, status: 'pendiente', sortOrder: 1, targetDate: HOY },
    ], HOY)
    expect(v.get('b')!.accionable).toBe(false)
  })
})

describe('lineaTrabada', () => {
  it('dice DÓNDE está trabado en vez de callar el pendiente', () => {
    const v = evaluarPrecondiciones([
      p({ id: 'contrato', title: 'Cerrar el primer contrato de consultoría', sortOrder: 0, targetDate: '2026-07-08' }),
      p({ id: 'facturar', title: 'Facturar el primer mes', sortOrder: 1, targetDate: HOY }),
    ], HOY)
    const linea = lineaTrabada('Facturar el primer mes', v.get('facturar')!)!
    expect(linea).toContain('Facturar el primer mes')
    expect(linea).toContain('Cerrar el primer contrato')
    expect(linea).toContain('2026-07-08')
    expect(linea).toMatch(/trabado ahí, no acá/)
  })

  it('un paso accionable no produce línea', () => {
    const v = evaluarPrecondiciones([p({ id: 'x', title: 'X', targetDate: HOY })], HOY)
    expect(lineaTrabada('X', v.get('x')!)).toBeNull()
  })
})
