// SIR V2 — Tests de "un paso de objetivo también es un encuentro".
//
// Los casos NO son inventados: son los pasos reales del objetivo de la relación
// (g_1780283810567), que traen los tres tipos pegados —el encuentro, su
// preparación y su agendamiento— y una sola persona vinculada al objetivo.
import { describe, it, expect } from 'vitest'
import { esEncuentro, nombraA, encuentrosDePasos, type PasoDeObjetivo } from './encuentroDePaso'
import { pedidoDeRegistroPendiente } from './pedirRegistro'

const OBJ = 'g_1780283810567'
const DIANA = '8758b7c2-9232-4db3-b0e8-dd489e339d40'
const NOMBRES = new Map([[DIANA, 'Diana Carolina Díaz Sánchez']])
const VINCULO = [{ objectiveId: OBJ, personIds: [DIANA] }]

// Textuales de la base.
const REALES: PasoDeObjetivo[] = [
  { objectiveId: OBJ, targetDate: '2026-07-31', title: 'Sostener la primera conversación con Diana usando la lista preparada' },
  { objectiveId: OBJ, targetDate: '2026-07-31', title: 'Escribir lista personal de necesidades y límites antes de la conversación' },
  { objectiveId: OBJ, targetDate: '2026-08-08', title: 'Agendar primera conversación cara a cara con Diana sobre el rumbo' },
  { objectiveId: OBJ, targetDate: '2026-08-14', title: 'Asistir a primera sesión de terapia individual' },
  { objectiveId: OBJ, targetDate: '2026-08-04', title: 'Implementar rutina diaria de 10 minutos de respiración' },
]

describe('el caso que se escapaba', () => {
  it('la conversación del 31-jul con Diana SÍ es un encuentro', () => {
    const e = encuentrosDePasos(REALES, VINCULO, NOMBRES)
    expect(e).toHaveLength(1)
    expect(e[0].date).toBe('2026-07-31')
    expect(e[0].personId).toBe(DIANA)
  })

  it('y encadenado con #1062, dispara el pedido a la mañana siguiente', () => {
    const encuentros = encuentrosDePasos(REALES, VINCULO, NOMBRES)
    const p = pedidoDeRegistroPendiente(encuentros, [], '2026-08-01')
    expect(p?.personName).toContain('Diana')
    expect(p?.dias).toBe(1)
  })

  it('deja de preguntar apenas queda el registro', () => {
    const encuentros = encuentrosDePasos(REALES, VINCULO, NOMBRES)
    const yaLog = [{ personId: DIANA, loggedAt: '2026-08-01T02:30:00Z' }]
    expect(pedidoDeRegistroPendiente(encuentros, yaLog, '2026-08-01')).toBeNull()
  })
})

describe('no confunde el encuentro con hablar DEL encuentro', () => {
  it('"Escribir lista … antes de la conversación" no es el encuentro', () => {
    expect(esEncuentro('Escribir lista personal de necesidades y límites antes de la conversación')).toBe(false)
  })

  it('"Agendar primera conversación cara a cara con Diana" es agendar, no conversar', () => {
    expect(esEncuentro('Agendar primera conversación cara a cara con Diana sobre el rumbo')).toBe(false)
  })

  it('un mismo encuentro no se pregunta tres veces', () => {
    // Los tres pasos de arriba hablan de LA MISMA conversación.
    expect(encuentrosDePasos(REALES, VINCULO, NOMBRES)).toHaveLength(1)
  })
})

describe('atribución: el paso tiene que NOMBRAR a la persona', () => {
  it('la terapia NO se le atribuye a Diana aunque cuelgue de su objetivo', () => {
    const solo = [REALES[3]]
    expect(encuentrosDePasos(solo, VINCULO, NOMBRES)).toEqual([])
  })

  it('un encuentro genérico sin nombre tampoco', () => {
    const generico = [{ objectiveId: OBJ, targetDate: '2026-08-11', title: 'Llamar o reunirse con la primera persona para conversar' }]
    expect(encuentrosDePasos(generico, VINCULO, NOMBRES)).toEqual([])
  })

  it('nombraA usa el primer nombre y respeta fronteras de palabra', () => {
    expect(nombraA('Conversar con Diana del rumbo', 'Diana Carolina Díaz')).toBe(true)
    expect(nombraA('Revisar el diagnóstico', 'Diana Carolina Díaz')).toBe(false)
    // "Dianira" no es "Diana".
    expect(nombraA('Llamar a Dianira', 'Diana Carolina Díaz')).toBe(false)
  })

  it('ignora tildes y mayúsculas en los dos lados', () => {
    expect(nombraA('CENA CON JOSÉ', 'José Luis')).toBe(true)
    expect(esEncuentro('CENA con José')).toBe(true)
  })
})

describe('el status del paso NO filtra', () => {
  it('un paso todavía pendiente igual cuenta: así estaba el de Diana', () => {
    // El 1-ago a las 6am el paso seguía en `pendiente` y la conversación ya había
    // ocurrido. Filtrar por 'hecho' habría perdido el único caso que motivó esto.
    const e = encuentrosDePasos([REALES[0]], VINCULO, NOMBRES)
    expect(e).toHaveLength(1)
  })
})

describe('no revienta', () => {
  it('con basura devuelve vacío', () => {
    expect(encuentrosDePasos([], [], new Map())).toEqual([])
    expect(encuentrosDePasos(null as unknown as PasoDeObjetivo[], VINCULO, NOMBRES)).toEqual([])
    expect(esEncuentro('')).toBe(false)
    expect(nombraA('algo', '')).toBe(false)
  })

  it('un objetivo sin personas vinculadas no produce nada', () => {
    expect(encuentrosDePasos(REALES, [{ objectiveId: OBJ, personIds: [] }], NOMBRES)).toEqual([])
  })

  it('una persona sin nombre en el mapa se saltea en vez de inventar', () => {
    expect(encuentrosDePasos(REALES, VINCULO, new Map())).toEqual([])
  })
})
