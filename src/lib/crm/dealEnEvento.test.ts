// SIR V2 — Tests del cruce CRM × agenda × grafo.
//
// El caso REAL, y la idea es de Aaron: "me la voy a encontrar mañana en el matrimonio
// de Laura, creo haberte mencionado que es su mejor amiga, eso debería darnos
// información en el grafo". Las tres tablas estaban pobladas y nadie las cruzaba.
import { describe, it, expect } from 'vitest'
import {
  encuentrosConDeal, encuentroConDealLine, VENTANA_DIAS,
  type DealLite, type EventoLite, type LinkLite,
} from './dealEnEvento'

const HOY = '2026-07-31'
const LAURA = 'per_laura'
const MILUSKA = 'per_miluska'
const NOMBRES = new Map([[LAURA, 'Laura Alfaro'], [MILUSKA, 'Miluska Castillo']])

const BODA: EventoLite = { title: 'Boda religiosa de Laura Alfaro', date: '2026-08-01', personId: LAURA }
const LINK: LinkLite = { personAId: MILUSKA, personBId: LAURA, kind: 'mejor_amiga' }
const HIKVISION: DealLite = {
  id: 'deal_miluska_hikvision_digital',
  title: 'Web multiinformativa + portal trade mkt — Hikvision (Miluska)',
  contactPersonId: MILUSKA,
  nextAction: 'Cotizarle la web tipo hikvision-ec.com/m/Promocion. Lleva 2 días esperando.',
  nextActionDate: '2026-07-29',
  stage: 'lead',
}

describe('el caso REAL: mañana la ve en la boda', () => {
  it('llega a Miluska POR EL GRAFO, no porque el evento sea suyo', () => {
    const r = encuentrosConDeal([BODA], [HIKVISION], [LINK], NOMBRES, HOY)
    expect(r).toHaveLength(1)
    expect(r[0].personName).toBe('Miluska Castillo')
    expect(r[0].dias).toBe(1)
    expect(r[0].via).toBe('mejor amiga de Laura Alfaro')
    expect(r[0].atraso).toBe(2)
  })

  it('la línea dice cuándo, con quién, por qué va a estar, y qué le debe', () => {
    const l = encuentroConDealLine(encuentrosConDeal([BODA], [HIKVISION], [LINK], NOMBRES, HOY), HOY)!
    expect(l).toContain('mañana')
    expect(l).toContain('Boda religiosa de Laura Alfaro')
    expect(l).toContain('Miluska Castillo')
    // El VÍNCULO tiene que estar: es una inferencia, no un hecho, y él debe poder desmentirla.
    expect(l).toContain('mejor amiga de Laura Alfaro')
    expect(l).toContain('2 días vencida')
    expect(l).toContain('Cotizarle la web')
  })

  it('el vínculo funciona en cualquier dirección de la arista', () => {
    const alRevés: LinkLite = { personAId: LAURA, personBId: MILUSKA, kind: 'mejor_amiga' }
    expect(encuentrosConDeal([BODA], [HIKVISION], [alRevés], NOMBRES, HOY)).toHaveLength(1)
  })

  it('también funciona DIRECTO: el evento es de la propia contacto', () => {
    const almuerzo: EventoLite = { title: 'Almuerzo con Miluska', date: '2026-08-02', personId: MILUSKA }
    const r = encuentrosConDeal([almuerzo], [HIKVISION], [], NOMBRES, HOY)
    expect(r).toHaveLength(1)
    expect(r[0].via).toBeNull() // no hay intermediario que nombrar
  })
})

describe('cuándo NO habla', () => {
  it('sin vínculo ni evento propio no inventa el encuentro', () => {
    expect(encuentrosConDeal([BODA], [HIKVISION], [], NOMBRES, HOY)).toHaveLength(0)
  })

  it('un deal SIN persona de contacto no se puede cruzar', () => {
    const anon = { ...HIKVISION, contactPersonId: null }
    expect(encuentrosConDeal([BODA], [anon], [LINK], NOMBRES, HOY)).toHaveLength(0)
  })

  it('un evento fuera de la ventana de 7 días no cuenta', () => {
    const lejos = { ...BODA, date: '2026-09-15' }
    expect(encuentrosConDeal([lejos], [HIKVISION], [LINK], NOMBRES, HOY)).toHaveLength(0)
  })

  it('un evento pasado tampoco', () => {
    const ayer = { ...BODA, date: '2026-07-30' }
    expect(encuentrosConDeal([ayer], [HIKVISION], [LINK], NOMBRES, HOY)).toHaveLength(0)
  })

  it('sin nada pendiente se calla: "la vas a ver" solo no es útil', () => {
    const sinFecha = { ...HIKVISION, nextActionDate: null }
    const r = encuentrosConDeal([BODA], [sinFecha], [LINK], NOMBRES, HOY)
    expect(r).toHaveLength(1) // el encuentro existe…
    expect(encuentroConDealLine(r, HOY)).toBeNull() // …pero no hay nada que perseguir
  })

  it('una acción que vence muy lejos no apremia todavía', () => {
    const lejana = { ...HIKVISION, nextActionDate: '2026-09-30' }
    const r = encuentrosConDeal([BODA], [lejana], [LINK], NOMBRES, HOY)
    expect(encuentroConDealLine(r, HOY)).toBeNull()
  })

  it('no revienta con entradas vacías', () => {
    expect(encuentrosConDeal([], [], [], new Map(), HOY)).toEqual([])
    expect(encuentroConDealLine([], HOY)).toBeNull()
    expect(VENTANA_DIAS).toBe(7)
  })
})

describe('prioridad cuando hay varios', () => {
  it('primero lo más inminente', () => {
    const otroDeal: DealLite = { ...HIKVISION, id: 'd2', title: 'Otro', contactPersonId: LAURA, nextActionDate: '2026-07-20' }
    const hoyEvento: EventoLite = { title: 'Café con Laura', date: HOY, personId: LAURA }
    const r = encuentrosConDeal([BODA, hoyEvento], [HIKVISION, otroDeal], [LINK], NOMBRES, HOY)
    expect(r[0].dias).toBe(0)
  })

  it('a igual día, primero el más atrasado', () => {
    const masAtrasado: DealLite = { ...HIKVISION, id: 'd3', title: 'Viejo', contactPersonId: LAURA, nextActionDate: '2026-07-01' }
    const r = encuentrosConDeal([BODA], [HIKVISION, masAtrasado], [LINK], NOMBRES, HOY)
    expect(r[0].deal.id).toBe('d3')
  })
})
