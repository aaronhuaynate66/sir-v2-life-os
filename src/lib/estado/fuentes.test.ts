import { describe, expect, it } from 'vitest'

import {
  estadoCalendario, estadoCorreo, estadoMotores, estadoSalud,
  fuentesSinInstrumentar, haceCuanto, ordenarFuentes, resumirFuentes,
  type FuenteEstado,
} from './fuentes'

const AHORA = Date.parse('2026-08-05T18:00:00Z')
const f = (over: Partial<FuenteEstado>): FuenteEstado => ({
  clave: 'x', nombre: 'X', grupo: 'lectores', vigilancia: 'ok',
  veredicto: 'ok', detalle: null, limite: null, comoEntra: '—', ...over,
})

describe('haceCuanto', () => {
  it('habla como se habla', () => {
    expect(haceCuanto('2026-08-05T10:00:00Z', AHORA)).toBe('hoy')
    expect(haceCuanto('2026-08-04T10:00:00Z', AHORA)).toBe('ayer')
    expect(haceCuanto('2026-07-30T10:00:00Z', AHORA)).toBe('hace 6 días')
    expect(haceCuanto(null, AHORA)).toBe('nunca')
    expect(haceCuanto('roto', AHORA)).toBe('nunca')
  })
})

describe('estadoCalendario', () => {
  it('un feed roto es CAÍDO y avisa que igual vas a ver eventos', () => {
    // La trampa real: `feed.ts` devuelve caché viejo cuando el fetch falla, así que
    // la agenda se ve normal con datos vencidos.
    const e = estadoCalendario({ calendars: [{ id: 'c1', label: 'Personal', error: 'HTTP 401' }] }, AHORA)
    expect(e.vigilancia).toBe('caido')
    expect(e.detalle).toContain('401')
    expect(e.limite).toContain('la copia vieja')
  })

  it('con varios feeds dice cuántos están rotos', () => {
    const e = estadoCalendario({
      calendars: [{ id: 'a', label: 'A', error: 'boom' }, { id: 'b', label: 'B' }],
    }, AHORA)
    expect(e.veredicto).toBe('1 roto')
  })

  it('sin feeds no dice "ok" — dice que no hay nada conectado', () => {
    expect(estadoCalendario({ calendars: [] }, AHORA).vigilancia).toBe('sin-vigilancia')
    expect(estadoCalendario(null, AHORA).vigilancia).toBe('sin-vigilancia')
  })

  it('todo sano informa cuándo se leyó', () => {
    const e = estadoCalendario({ calendars: [{ id: 'a', label: 'A' }], fetchedAt: '2026-08-05T17:00:00Z' }, AHORA)
    expect(e.vigilancia).toBe('ok')
    expect(e.detalle).toBe('leído hoy')
  })
})

describe('estadoCorreo', () => {
  it('SIEMPRE dice que no hay cron, aunque esté al día', () => {
    // Es el hecho que hoy no se le dice en ningún lado: si Aaron no aprieta el botón,
    // no entra nada. Una fecha sola no comunica eso.
    const e = estadoCorreo('2026-08-05T10:00:00Z', true, AHORA)
    expect(e.vigilancia).toBe('ok')
    expect(e.limite).toContain('No hay cron')
    expect(e.comoEntra).toContain('MANUAL')
  })

  it('pasados 3 días pide atención', () => {
    expect(estadoCorreo('2026-07-25T10:00:00Z', true, AHORA).vigilancia).toBe('atencion')
    expect(estadoCorreo('2026-07-25T10:00:00Z', true, AHORA).detalle).toContain('hace 11 días')
  })

  it('sin cuenta conectada no se inventa un veredicto', () => {
    expect(estadoCorreo(null, false, AHORA).vigilancia).toBe('sin-vigilancia')
  })
})

describe('estadoSalud', () => {
  it('el límite es el dato: no distingue "no me pesé" de "se rompió"', () => {
    const e = estadoSalud('2026-08-05T10:00:00Z', AHORA)
    expect(e.vigilancia).toBe('ok')
    expect(e.limite).toContain('no se puede distinguir')
  })

  it('sin datos nuevos pide atención, sin afirmar que esté roto', () => {
    const e = estadoSalud('2026-07-28T10:00:00Z', AHORA)
    expect(e.vigilancia).toBe('atencion')
    expect(e.veredicto).toBe('Sin datos nuevos')
  })
})

describe('fuentesSinInstrumentar', () => {
  it('Telegram y WhatsApp Cloud APARECEN, en vez de omitirse', () => {
    // Omitirlas insinuaría que están sanas. La regla del repo es no concluir nada
    // desde una vista que no las alcanza.
    const fs = fuentesSinInstrumentar()
    expect(fs.map((x) => x.clave).sort()).toEqual(['telegram', 'whatsapp_cloud'])
    expect(fs.every((x) => x.vigilancia === 'sin-vigilancia')).toBe(true)
    expect(fs.every((x) => (x.limite ?? '').length > 10)).toBe(true)
  })
})

describe('estadoMotores', () => {
  const base = { totalCrons: 13, vigilados: 2 }

  it('un motor mudo es CAÍDO y se dice con el nombre de lo que hace', () => {
    const e = estadoMotores({ ...base, atrasados: [{ etiqueta: 'el motor que vigila cómo viene cada relación', dias: 3 }], noVerificables: [] }, AHORA)
    expect(e.vigilancia).toBe('caido')
    expect(e.detalle).toContain('vigila cómo viene cada relación')
    expect(e.detalle).toContain('3 días')
  })

  it('"no se pudo mirar" NO es "está caído"', () => {
    const e = estadoMotores({ ...base, atrasados: [], noVerificables: [{ etiqueta: 'tu brief de la mañana' }] }, AHORA)
    expect(e.vigilancia).toBe('sin-vigilancia')
    expect(e.veredicto).toBe('No verificable')
  })

  it('aunque esté todo al día, declara que solo vigila 2 de 13', () => {
    const e = estadoMotores({ ...base, atrasados: [], noVerificables: [] }, AHORA)
    expect(e.vigilancia).toBe('ok')
    expect(e.limite).toContain('Solo 2 de 13')
  })
})

describe('ordenarFuentes', () => {
  it('lo roto arriba, lo sano abajo, lo ciego en el medio', () => {
    const orden = ordenarFuentes([
      f({ clave: 'a', vigilancia: 'ok' }),
      f({ clave: 'b', vigilancia: 'sin-vigilancia' }),
      f({ clave: 'c', vigilancia: 'caido' }),
      f({ clave: 'd', vigilancia: 'atencion' }),
    ]).map((x) => x.clave)
    expect(orden).toEqual(['c', 'd', 'b', 'a'])
  })
})

describe('resumirFuentes', () => {
  it('NUNCA dice solo "todo andando" si hay fuentes ciegas', () => {
    // Es la regla dura: no concluir que algo está bien desde una vista parcial.
    const r = resumirFuentes([
      f({ clave: 'a', vigilancia: 'ok' }),
      f({ clave: 'b', vigilancia: 'sin-vigilancia' }),
      f({ clave: 'c', vigilancia: 'sin-vigilancia' }),
    ])
    expect(r.titular).toBe('1 andando · 2 que no se pueden vigilar')
    expect(r.sinVigilancia).toBe(2)
  })

  it('con todo sano y nada ciego sí puede decirlo pelado', () => {
    expect(resumirFuentes([f({ vigilancia: 'ok' }), f({ vigilancia: 'ok' })]).titular).toBe('2 andando')
  })

  it('si NINGUNA se puede vigilar, lo dice sin disfrazarlo', () => {
    const r = resumirFuentes([f({ vigilancia: 'sin-vigilancia' }), f({ vigilancia: 'sin-vigilancia' })])
    expect(r.titular).toBe('Ninguna de las 2 fuentes se puede vigilar.')
  })

  it('lo caído manda en el titular', () => {
    const r = resumirFuentes([f({ vigilancia: 'caido' }), f({ vigilancia: 'atencion' }), f({ vigilancia: 'ok' })])
    expect(r.titular).toBe('1 caída · 1 para mirar · 1 andando')
  })

  it('sin fuentes no finge un estado', () => {
    expect(resumirFuentes([]).titular).toBe('No hay ninguna fuente configurada.')
  })
})
