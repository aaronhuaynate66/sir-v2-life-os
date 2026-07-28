import { describe, it, expect } from 'vitest'
import {
  commercialIntent,
  detectOpportunitySignals,
  opportunityBriefLine,
  COOLING_DAYS,
  type PersonThread,
  type ThreadMessage,
} from './detect'

const NOW = new Date('2026-07-28T12:00:00Z')
const dias = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString()

const msg = (o: Partial<ThreadMessage> & { text: string }): ThreadMessage => ({
  sentAt: dias(1), fromMe: false, ...o,
})
const thread = (o: Partial<PersonThread> & { personId: string; personName: string }): PersonThread => ({
  messages: [], ...o,
})

describe('commercialIntent', () => {
  // `strong` ya NO filtra — con el esquema de dos etapas todo lo que matchea es
  // candidato y el juez decide. `strong` solo fija la confianza que se reporta.
  it('marca como FUERTE lo que tiene dirección inequívoca (te piden a TI)', () => {
    for (const t of [
      'oye me cotizas unas agendas por favor',
      'necesito un presupuesto para la web',
      '¿cuánto sale hacer el landing?',
      'me pasas la cotización?',
      'cotízame esto porfa',
    ]) {
      expect(commercialIntent(t).strong, t).toBe(true)
    }
  })

  it('genera candidato SIN declararlo fuerte cuando la dirección es ambigua', () => {
    // Estos son los que ensuciaban el brief cuando el lexicón decidía solo.
    for (const t of ['quiero contratar el servicio', 'ya cotizaste?', 'me facturas?', 'cuáles son los precios']) {
      const r = commercialIntent(t)
      expect(r.matched.length, t).toBeGreaterThan(0)
      expect(r.strong, t).toBe(false)
    }
  })

  // Regresión del primer bug: `me cotizas` no matcheaba porque la `s` rompía el
  // `\b`, y `cotízame` porque la `í` no es `\w`. Se arregló normalizando el texto
  // (minúsculas + sin tildes) y usando raíces, no formas cerradas.
  it('aguanta CONJUGACIONES y TILDES, que es como se escribe de verdad', () => {
    for (const t of [
      'me cotizas unas agendas', 'cotízame esto porfa', 'me cotizás?', 'ya cotizaste?',
      'necesito la cotización', 'cuánto sería el precio', 'me facturas?', 'cuanto sale',
    ]) {
      expect(commercialIntent(t).matched.length, t).toBeGreaterThan(0)
    }
  })

  it('marca señales débiles sin declararlas fuertes', () => {
    const r = commercialIntent('me interesa, cuáles son los precios?')
    expect(r.matched.length).toBeGreaterThan(0)
    expect(r.strong).toBe(false)
  })

  it('ignora ruido del import: media, base64 y textos muy cortos', () => {
    expect(commercialIntent('[media]').matched).toEqual([])
    expect(commercialIntent('/9j/4AAQSkZJRgABAQAAAQABAAD' + 'A'.repeat(120)).matched).toEqual([])
    expect(commercialIntent('ok').matched).toEqual([])
    expect(commercialIntent('').matched).toEqual([])
  })

  it('no inventa intención donde no hay', () => {
    for (const t of ['hola cómo estás', 'jaja oye todavía no está hecha la tarea', 'feliz cumple hermano']) {
      expect(commercialIntent(t).matched, t).toEqual([])
    }
  })
})

describe('detectOpportunitySignals', () => {
  it('el caso Miluska: pedido fresco y SIN deal → oportunidad sin registrar', () => {
    const r = detectOpportunitySignals([
      thread({
        personId: 'p_mil', personName: 'Miluska Castillo',
        messages: [msg({ text: 'hola, me cotizas unos servicios digitales?', sentAt: dias(3) })],
      }),
    ], [], NOW)
    expect(r).toHaveLength(1)
    expect(r[0].kind).toBe('oportunidad_sin_registrar')
    expect(r[0].confidence).toBe('alta')
    expect(r[0].text).toContain('Miluska Castillo')
    // La cita textual va SIEMPRE: Aaron juzga el dato, no el veredicto.
    expect(r[0].quote).toContain('servicios digitales')
    // Y con qué palabras se buscó.
    expect(r[0].matched).toContain('me cotizas')
  })

  it('el caso Boticas: hubo pedido y el hilo se apagó → enfriamiento', () => {
    const r = detectOpportunitySignals([
      thread({
        personId: 'p_day', personName: 'Dayana',
        messages: [
          msg({ text: 'me pasas una propuesta para la web?', sentAt: dias(40) }),
          msg({ text: 'ya lo vemos', sentAt: dias(30), fromMe: false }),
        ],
      }),
    ], [], NOW)
    expect(r).toHaveLength(1)
    expect(r[0].kind).toBe('enfriamiento')
    expect(r[0].daysSinceLast).toBe(30)
    expect(r[0].text).toMatch(/se está enfriando/i)
  })

  it('NO propone lo que ya está en el pipeline (evita duplicar detectDealGap)', () => {
    const th = thread({
      personId: 'p_mil', personName: 'Miluska',
      messages: [msg({ text: 'me cotizas esto?', sentAt: dias(2) })],
    })
    expect(detectOpportunitySignals([th], [{ contactPersonId: 'p_mil', status: 'open' }], NOW)).toEqual([])
    // Un deal CERRADO no bloquea: puede ser una oportunidad nueva.
    expect(detectOpportunitySignals([th], [{ contactPersonId: 'p_mil', status: 'won' }], NOW)).toHaveLength(1)
  })

  it('solo cuentan los pedidos ENTRANTES (lo que Aaron pide no es una oportunidad)', () => {
    const r = detectOpportunitySignals([
      thread({
        personId: 'p_x', personName: 'X',
        messages: [msg({ text: 'te cotizo la web?', fromMe: true, sentAt: dias(2) })],
      }),
    ], [], NOW)
    expect(r).toEqual([])
  })

  it('ignora lo que quedó fuera de la ventana de 90 días', () => {
    const r = detectOpportunitySignals([
      thread({
        personId: 'p_x', personName: 'X',
        messages: [msg({ text: 'me cotizas la web?', sentAt: dias(200) })],
      }),
    ], [], NOW)
    expect(r).toEqual([])
  })

  it('un pedido viejo pero con hilo VIVO no se marca ni fresco ni enfriado', () => {
    const r = detectOpportunitySignals([
      thread({
        personId: 'p_x', personName: 'X',
        messages: [
          msg({ text: 'me cotizas?', sentAt: dias(60) }),   // > FRESH_DAYS
          msg({ text: 'jaja ok', sentAt: dias(1) }),         // hilo vivo → no es enfriamiento
        ],
      }),
    ], [], NOW)
    expect(r).toEqual([])
  })

  it('el umbral de enfriamiento es exactamente COOLING_DAYS', () => {
    const armar = (silencio: number) => detectOpportunitySignals([
      thread({
        personId: 'p_x', personName: 'X',
        messages: [msg({ text: 'me cotizas la web?', sentAt: dias(silencio) })],
      }),
    ], [], NOW)
    expect(armar(COOLING_DAYS)[0].kind).toBe('enfriamiento')
    expect(armar(COOLING_DAYS - 1)[0].kind).toBe('oportunidad_sin_registrar')
  })

  it('una persona da UNA señal (la del pedido más reciente), no una por mensaje', () => {
    const r = detectOpportunitySignals([
      thread({
        personId: 'p_x', personName: 'X',
        messages: [
          msg({ text: 'me cotizas la web?', sentAt: dias(20) }),
          msg({ text: 'y también me presupuestas el hosting?', sentAt: dias(3) }),
        ],
      }),
    ], [], NOW)
    expect(r).toHaveLength(1)
    expect(r[0].quote).toContain('hosting')
  })

  it('ordena: oportunidad fresca antes que enfriamiento', () => {
    const r = detectOpportunitySignals([
      thread({ personId: 'p_frio', personName: 'Frío', messages: [msg({ text: 'me cotizas?', sentAt: dias(40) })] }),
      thread({ personId: 'p_hot', personName: 'Fresco', messages: [msg({ text: 'me cotizas?', sentAt: dias(2) })] }),
    ], [], NOW)
    expect(r.map((s) => s.personName)).toEqual(['Fresco', 'Frío'])
  })
})

describe('opportunityBriefLine', () => {
  it('sin señales devuelve null — NUNCA dice "no hay oportunidades"', () => {
    // Regla dura del repo: no concluir ausencia desde una ventana parcial.
    expect(opportunityBriefLine([])).toBeNull()
  })

  it('muestra la top y cuenta las demás', () => {
    const s = detectOpportunitySignals([
      thread({ personId: 'a', personName: 'Ana', messages: [msg({ text: 'me cotizas la web?', sentAt: dias(2) })] }),
      thread({ personId: 'b', personName: 'Beto', messages: [msg({ text: 'me cotizas el hosting?', sentAt: dias(4) })] }),
    ], [], NOW)
    const line = opportunityBriefLine(s)
    expect(line).toContain('Ana')
    expect(line).toContain('+1 señal')
  })

  it('la línea SIEMPRE declara con qué palabras se buscó', () => {
    const s = detectOpportunitySignals([
      thread({ personId: 'a', personName: 'Ana', messages: [msg({ text: 'me pasas un presupuesto?', sentAt: dias(2) })] }),
    ], [], NOW)
    expect(opportunityBriefLine(s)).toMatch(/Lo vi por las palabras/)
  })
})
