// SIR V2 — Tests de las tareas invisibles.
//
// Datos reales del 1-ago-2026: 6 tareas sin fecha en objetivos activos. La de
// Marlab llevaba 13 días; cuatro del Mundial, 59. Y 27 `key_result` sin fecha que
// NO son un problema — confundirlas habría inflado el hallazgo por 6.
import { describe, it, expect } from 'vitest'
import { tareaInvisible, tareaInvisibleLine, DIAS_MINIMOS, fechasPropuestas, etiquetaDeFecha, refDeFecha, parseRefDeFecha, type PasoSinFecha, type ObjetivoVivo } from './sinFecha'

const HOY = '2026-08-01'
const MUNDIAL: ObjetivoVivo = { id: 'g_mundial', title: 'Ganar el Mundial de Bomberos', status: 'active' }
const MARLAB: ObjetivoVivo = { id: 'g_marlab', title: 'Marlab factura S/ 1 millón anual', status: 'active' }
const OBJS = [MUNDIAL, MARLAB]

const paso = (p: Partial<PasoSinFecha>): PasoSinFecha => ({
  id: 'st_1', objectiveId: 'g_marlab', title: 'Una tarea', kind: 'task',
  targetDate: null, status: 'pendiente', createdAt: '2026-07-19T00:00:00Z', ...p,
})

describe('el caso real', () => {
  it('encuentra la tarea de Dayana, invisible hace 13 días', () => {
    const t = tareaInvisible([paso({ title: 'Pedirle a Dayana que me conecte con su contacto' })], OBJS, HOY)!
    expect(t.dias).toBe(13)
    expect(t.objetivo).toContain('Marlab')
  })

  it('con varias, elige la MÁS VIEJA', () => {
    const t = tareaInvisible([
      paso({ id: 'a', title: 'reciente', createdAt: '2026-07-19T00:00:00Z' }),
      paso({ id: 'b', objectiveId: 'g_mundial', title: 'vieja', createdAt: '2026-06-03T00:00:00Z' }),
    ], OBJS, HOY)!
    expect(t.id).toBe('b')
    expect(t.dias).toBe(59)
  })

  it('la línea dice cuántos días y nombra el objetivo', () => {
    const l = tareaInvisibleLine(tareaInvisible([paso({ title: 'Armar presupuesto total' })], OBJS, HOY))!
    expect(l).toContain('13 días sin fecha')
    expect(l).toContain('Marlab')
    expect(l).toContain('¿Para cuándo?')
  })
})

describe('lo que NO cuenta', () => {
  it('un key_result sin fecha es normal, no un olvido', () => {
    // 27 de las 36 filas sin fecha eran esto. Es el filtro que evita inflar por 6.
    expect(tareaInvisible([paso({ kind: 'key_result' })], OBJS, HOY)).toBeNull()
  })

  it('una tarea CON fecha ya la muestra el brief', () => {
    expect(tareaInvisible([paso({ targetDate: '2026-08-10' })], OBJS, HOY)).toBeNull()
  })

  it('hecha o descartada no se pide', () => {
    expect(tareaInvisible([paso({ status: 'hecho' })], OBJS, HOY)).toBeNull()
    expect(tareaInvisible([paso({ status: 'descartado' })], OBJS, HOY)).toBeNull()
  })

  it('un objetivo pausado o abandonado no reclama nada', () => {
    const pausado = [{ ...MARLAB, status: 'paused' }]
    expect(tareaInvisible([paso({})], pausado, HOY)).toBeNull()
    const abandonado = [{ ...MARLAB, status: 'abandoned' }]
    expect(tareaInvisible([paso({})], abandonado, HOY)).toBeNull()
  })

  it('recién escrita todavía no es un olvido', () => {
    expect(DIAS_MINIMOS).toBe(7)
    expect(tareaInvisible([paso({ createdAt: '2026-07-29T00:00:00Z' })], OBJS, HOY)).toBeNull()
    // Justo en el umbral sí.
    expect(tareaInvisible([paso({ createdAt: '2026-07-25T00:00:00Z' })], OBJS, HOY)).not.toBeNull()
  })

  it('un paso de un objetivo que no existe no se atribuye a nadie', () => {
    expect(tareaInvisible([paso({ objectiveId: 'g_fantasma' })], OBJS, HOY)).toBeNull()
  })
})

describe('no revienta', () => {
  it('con basura', () => {
    expect(tareaInvisible([], [], HOY)).toBeNull()
    expect(tareaInvisible(null as unknown as PasoSinFecha[], OBJS, HOY)).toBeNull()
    expect(tareaInvisible([paso({ createdAt: 'no-es-fecha' })], OBJS, HOY)).toBeNull()
    expect(tareaInvisible([paso({})], OBJS, 'no-es-fecha')).toBeNull()
    expect(tareaInvisibleLine(null)).toBeNull()
  })

  it('un título larguísimo se recorta', () => {
    const l = tareaInvisibleLine(tareaInvisible([paso({ title: 'x'.repeat(200) })], OBJS, HOY))!
    // El tope real lo pone el título (60), no la línea entera: el nombre del
    // objetivo también entra y es de Aaron, no se recorta.
    expect(l.length).toBeLessThan(200)
    expect(l).toContain('…')
  })
})

describe('proponer la fecha en vez de preguntarla', () => {
  it('ofrece dos fechas concretas', () => {
    const f = fechasPropuestas('2026-08-01', '2026-12-31')
    expect(f).toEqual(['2026-08-04', '2026-08-11'])
    expect(etiquetaDeFecha(f[0])).toBe('mar 4 ago')
  })

  it('NUNCA propone después del límite: nacería vencida', () => {
    const f = fechasPropuestas('2026-08-01', '2026-08-06')
    expect(f.every((d) => d <= '2026-08-06')).toBe(true)
  })

  it('si el límite está más cerca que el primer adelanto, ofrece UNA sola', () => {
    // Dos botones con la misma fecha serían un botón repetido.
    expect(fechasPropuestas('2026-08-01', '2026-08-02')).toEqual(['2026-08-02'])
  })

  it('sin límite propone los dos adelantos', () => {
    expect(fechasPropuestas('2026-08-01', null)).toEqual(['2026-08-04', '2026-08-11'])
  })

  it('un límite ya VENCIDO no sirve de tope', () => {
    expect(fechasPropuestas('2026-08-01', '2026-07-01')).toEqual(['2026-08-04', '2026-08-11'])
  })

  it('la ref sobrevive ida y vuelta y cabe en Telegram', () => {
    const ref = refDeFecha('step_1782872297596_frsp3i', '2026-08-04')
    expect(`br|task_date|${ref}`.length).toBeLessThanOrEqual(64)
    expect(parseRefDeFecha(ref)).toEqual({ stepId: 'step_1782872297596_frsp3i', iso: '2026-08-04' })
  })

  it('una ref mala NO fecha nada a la adivinanza', () => {
    expect(parseRefDeFecha('sin-fecha')).toBeNull()
    expect(parseRefDeFecha('step_x:2026-13-45')).toBeNull()
    expect(parseRefDeFecha(':2026-08-04')).toBeNull()
    expect(parseRefDeFecha('')).toBeNull()
  })

  it('no revienta', () => {
    expect(fechasPropuestas('no-es-fecha')).toEqual([])
    expect(etiquetaDeFecha('no-es-fecha')).toBe('')
  })
})
