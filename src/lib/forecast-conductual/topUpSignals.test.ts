// SIR V2 — Tests del top-up de señales diarias.
//
// El caso que motivó el módulo es el primero: Diana tenía 820 filas y la más nueva
// del 8-jul, con mensajes hasta el 30-jul. El candado `sigRows.length >= 10` de
// `/api/forecast` la dejaba congelada para siempre.
import { describe, it, expect } from 'vitest'
import { planTopUpSignals, necesitaTopUp, VENTANA_RECALCULO_DIAS } from './topUpSignals'
import type { ChatMessage } from './types'

const HOY = '2026-07-31'
const NOW = '2026-07-31T15:00:00.000Z'

function msg(date: string, text: string, author: 'user' | 'other' = 'other'): ChatMessage {
  return { at: `${date}T12:00:00Z`, author, text }
}

function plan(messages: ChatMessage[], storedDates: string[], hoy = HOY) {
  return planTopUpSignals({ userId: 'u1', personId: 'p1', messages, storedDates, hoy, nowIso: NOW })
}

describe('planTopUpSignals — el caso REAL que lo motivó', () => {
  it('recalcula los días con mensajes que quedaron sin fila (la serie congelada de Diana)', () => {
    // Guardado hasta el 8-jul; hay conversación hasta el 30.
    const stored = ['2026-07-07', '2026-07-08']
    const messages = [
      msg('2026-07-08', 'te amo mucho'),
      msg('2026-07-24', 'ya no quiero discutir'),
      msg('2026-07-30', 'lo que sí fastidia es que me digas esto, entiende eso'),
    ]
    const { rows } = plan(messages, stored)
    const fechas = rows.map((r) => r.date)
    expect(fechas).toContain('2026-07-24')
    expect(fechas).toContain('2026-07-30')
  })

  it('solo los mensajes de ELLA generan día: la señal mide lo que la persona expresa', () => {
    // `buildDailySignals` descarta author 'user' a propósito (mide el estado de la
    // persona rastreada, no el de Aaron). Un día en el que solo escribe él no
    // produce señal — y eso NO es un bug: es el contrato de la serie.
    const { rows } = plan([msg('2026-07-24', 'algo que dijo Aaron', 'user')], [])
    expect(rows).toHaveLength(0)
  })

  it('el último día sale del máximo, no del orden de llegada de los mensajes', () => {
    // El sustrato no garantiza orden ascendente; con un mensaje viejo al final, un
    // `serie[serie.length - 1]` daría el día equivocado y el atajo decidiría al revés.
    const r = plan([msg('2026-07-30', 'nuevo'), msg('2026-07-02', 'viejo')], [])
    expect(r.ultimoDiaConMensajes).toBe('2026-07-30')
  })

  it('NO reescribe un día viejo que ya tenía fila — es trabajo idéntico repetido', () => {
    const messages = [msg('2026-07-08', 'hola')]
    const { rows } = plan(messages, ['2026-07-08'])
    expect(rows).toHaveLength(0)
  })

  it('SÍ reescribe los días recientes aunque ya tengan fila (el día se sigue completando)', () => {
    // Si el día de hoy se diera por cerrado con la primera pasada, la pelea de la
    // tarde quedaría medida con los mensajes de la mañana.
    const messages = [msg(HOY, 'buenos días'), msg('2026-07-30', 'x')]
    const { rows } = plan(messages, [HOY, '2026-07-30'])
    expect(rows.map((r) => r.date)).toContain(HOY)
  })

  it('la ventana de recálculo cubre hoy y los 2 días previos, no más', () => {
    expect(VENTANA_RECALCULO_DIAS).toBe(3)
    const dias = ['2026-07-31', '2026-07-30', '2026-07-29', '2026-07-28']
    const { rows } = plan(dias.map((d) => msg(d, 'algo')), dias)
    const fechas = rows.map((r) => r.date).sort()
    expect(fechas).toEqual(['2026-07-29', '2026-07-30', '2026-07-31'])
  })
})

describe('planTopUpSignals — bordes', () => {
  it('trae el afecto y el ratio en la fila (es el punto del IAE)', () => {
    const { rows } = plan([msg(HOY, 'te amo mi amor ❤️'), msg(HOY, 'gracias por todo')], [])
    expect(rows).toHaveLength(1)
    expect(rows[0].affection).toBeGreaterThan(0)
    expect(rows[0].positivity_ratio).toBeGreaterThan(0)
  })

  it('el id es determinístico por (persona, día) → upsert idempotente, no duplica', () => {
    const a = plan([msg(HOY, 'x')], [])
    const b = plan([msg(HOY, 'x')], [])
    expect(a.rows[0].id).toBe(b.rows[0].id)
    expect(a.rows[0].id).toBe(`sig:p1:${HOY}`)
  })

  it('descarta días en el FUTURO: este sustrato ya tuvo desfases de 5 h', () => {
    const { rows } = plan([msg('2026-08-05', 'mensaje imposible')], [])
    expect(rows).toHaveLength(0)
  })

  it('sin mensajes no escribe nada y no revienta', () => {
    expect(plan([], []).rows).toHaveLength(0)
    expect(planTopUpSignals({ userId: 'u', personId: 'p', messages: null as unknown as ChatMessage[], storedDates: [], hoy: HOY, nowIso: NOW }).rows).toHaveLength(0)
  })

  it('reporta el último día guardado y el último con mensajes', () => {
    const r = plan([msg('2026-07-30', 'x')], ['2026-07-08', '2026-07-07'])
    expect(r.ultimoDiaGuardado).toBe('2026-07-08')
    expect(r.ultimoDiaConMensajes).toBe('2026-07-30')
  })
})

describe('necesitaTopUp — el atajo que evita bajar 50k mensajes al abrir el panel', () => {
  it('sí cuando lo guardado quedó atrás (el caso de Diana: 8-jul vs 30-jul)', () => {
    expect(necesitaTopUp('2026-07-08', '2026-07-30')).toBe(true)
  })

  it('no cuando lo guardado ya llega al último día con actividad', () => {
    expect(necesitaTopUp('2026-07-30', '2026-07-30')).toBe(false)
  })

  it('sí cuando no hay nada guardado pero hay actividad', () => {
    expect(necesitaTopUp(null, '2026-07-30')).toBe(true)
  })

  it('no cuando no hay actividad: sin sustrato no hay nada que poner al día', () => {
    expect(necesitaTopUp('2026-07-08', null)).toBe(false)
    expect(necesitaTopUp(null, null)).toBe(false)
  })
})
