// SIR V2 — Tests de "pedir el registro".
//
// Pedido de Aaron (31-jul-2026): "todo esto se arrastra porque no tenemos un método
// más eficiente que te inyecte cada vez que tenga una conversación". Y la prueba:
// hablaron en persona el lunes 27-jul y "como fue verbal no hay registro de eso" — el
// motor de estado seguía leyendo el 29-jul y llamaba "estable" a la relación.
import { describe, it, expect } from 'vitest'
import {
  pedidoDeRegistroPendiente, pedidoDeRegistroLine, refDeCarita, parseRefDeCarita,
  cuando, CARITAS, VENTANA_DIAS,
  type EncuentroPasado, type RegistroExistente,
} from './pedirRegistro'

const HOY = '2026-08-02'
const DIANA = 'per_diana'
const CONVERSACION: EncuentroPasado = {
  personId: DIANA, personName: 'Diana Carolina Díaz Sánchez',
  date: '2026-08-01', title: 'Conversación de fondo con Diana',
}

describe('el caso que lo motivó', () => {
  it('pregunta por el encuentro de AYER que no dejó registro', () => {
    const p = pedidoDeRegistroPendiente([CONVERSACION], [], HOY)!
    expect(p.personName).toContain('Diana')
    expect(p.dias).toBe(1)
  })

  it('la línea usa el primer nombre y pregunta ABIERTO, sin insinuar la respuesta', () => {
    const l = pedidoDeRegistroLine(pedidoDeRegistroPendiente([CONVERSACION], [], HOY))!
    expect(l).toContain('ayer')
    expect(l).toContain('Diana')
    expect(l).not.toContain('Carolina')
    expect(l).toContain('¿Cómo te fue?')
    // Nada que presuponga: "¿mejoró?" contaminaría el registro.
    expect(l.toLowerCase()).not.toContain('mejoró')
  })

  it('NO vuelve a preguntar si ya registró algo ese día o después', () => {
    const yaLog: RegistroExistente[] = [{ personId: DIANA, loggedAt: '2026-08-01T23:30:00Z' }]
    expect(pedidoDeRegistroPendiente([CONVERSACION], yaLog, HOY)).toBeNull()
  })

  it('un registro ANTERIOR al encuentro no cuenta: es de otra cosa', () => {
    const viejo: RegistroExistente[] = [{ personId: DIANA, loggedAt: '2026-07-29T12:00:00Z' }]
    expect(pedidoDeRegistroPendiente([CONVERSACION], viejo, HOY)).not.toBeNull()
  })
})

describe('cuándo NO pregunta', () => {
  it('no pregunta por el encuentro de HOY: puede no haber ocurrido todavía', () => {
    const hoyMismo = { ...CONVERSACION, date: HOY }
    expect(pedidoDeRegistroPendiente([hoyMismo], [], HOY)).toBeNull()
  })

  it('no pregunta por algo FUTURO', () => {
    const mañana = { ...CONVERSACION, date: '2026-08-05' }
    expect(pedidoDeRegistroPendiente([mañana], [], HOY)).toBeNull()
  })

  it('fuera de la ventana se calla: el recuerdo ya se diluyó', () => {
    expect(VENTANA_DIAS).toBe(3)
    const viejo = { ...CONVERSACION, date: '2026-07-20' }
    expect(pedidoDeRegistroPendiente([viejo], [], HOY)).toBeNull()
  })

  it('un registro de OTRA persona no lo silencia', () => {
    const otro: RegistroExistente[] = [{ personId: 'per_otro', loggedAt: '2026-08-01T23:00:00Z' }]
    expect(pedidoDeRegistroPendiente([CONVERSACION], otro, HOY)).not.toBeNull()
  })

  it('no revienta con basura', () => {
    expect(pedidoDeRegistroPendiente([], [], HOY)).toBeNull()
    expect(pedidoDeRegistroPendiente(null as unknown as EncuentroPasado[], [], HOY)).toBeNull()
    expect(pedidoDeRegistroLine(null)).toBeNull()
  })
})

describe('prioridad y caritas', () => {
  it('con varios encuentros pregunta por el MÁS RECIENTE: es el que mejor recuerda', () => {
    const anteayer = { ...CONVERSACION, personId: 'per_x', personName: 'Otro', date: '2026-07-31' }
    const p = pedidoDeRegistroPendiente([anteayer, CONVERSACION], [], HOY)!
    expect(p.personId).toBe(DIANA)
  })

  it('son 5 caritas, igual que el panel de la ficha', () => {
    expect(CARITAS).toHaveLength(5)
    expect(CARITAS.map((c) => c.valor)).toEqual([1, 2, 3, 4, 5])
  })

  it('la ref del botón sobrevive ida y vuelta y cabe en Telegram', () => {
    const ref = refDeCarita('per_1781421351570_n2esyb', 2)
    expect(ref.length).toBeLessThan(60) // tope de callback_data: 64 bytes
    expect(parseRefDeCarita(ref)).toEqual({ personId: 'per_1781421351570_n2esyb', valor: 2 })
  })

  it('rechaza refs inválidas en vez de escribir un valor cualquiera', () => {
    expect(parseRefDeCarita('sin_valor')).toBeNull()
    expect(parseRefDeCarita('per_x:9')).toBeNull()
    expect(parseRefDeCarita('per_x:0')).toBeNull()
    expect(parseRefDeCarita(':3')).toBeNull()
  })

  it('cuando() habla en días, no en fechas', () => {
    expect(cuando(1)).toBe('ayer')
    expect(cuando(2)).toBe('anteayer')
    expect(cuando(3)).toBe('hace 3 días')
  })
})
