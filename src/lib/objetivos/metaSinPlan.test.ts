// SIR V2 — Tests de "una meta sin un solo paso".
//
// Datos reales del 1-ago-2026: 5 objetivos activos con cero tareas. Dos vencen el
// 31-ago sin un paso escrito. Y varios tienen `key_result` cargados, que NO son
// plan — describen el destino, no el primer paso.
import { describe, it, expect } from 'vitest'
import {
  metaSinPlan, metaSinPlanLine, parsePlanPropuesto, fechaEnDias, MAX_PASOS,
  type MetaLite, type PasoLite,
} from './metaSinPlan'

const HOY = '2026-08-01'
const meta = (m: Partial<MetaLite>): MetaLite =>
  ({ id: 'g1', title: 'Subir ingresos a S/ 15,000/mes', status: 'active', targetDate: '2026-08-31', ...m })

describe('el caso real', () => {
  it('encuentra la meta vacía y calcula los días al límite', () => {
    const r = metaSinPlan([meta({})], [], HOY)!
    expect(r.title).toContain('15,000')
    expect(r.dias).toBe(30)
  })

  it('la línea OFRECE en vez de interrogar', () => {
    const l = metaSinPlanLine(metaSinPlan([meta({})], [], HOY))!
    expect(l).toContain('vence en 30 días')
    expect(l).toContain('¿Te armo el plan?')
    // "¿Qué hacemos con esto?" le devolvería el trabajo. Eso es lo que falló dos veces.
    expect(l).not.toContain('¿Qué hacemos')
  })

  it('una meta CON tareas no aparece', () => {
    const pasos: PasoLite[] = [{ objectiveId: 'g1', kind: 'task', status: 'pendiente' }]
    expect(metaSinPlan([meta({})], pasos, HOY)).toBeNull()
  })
})

describe('los key_result NO son plan', () => {
  it('una meta con 4 key_results y 0 tareas sigue estando parada', () => {
    // Es el caso de "Cliente recurrente de S/5,000": tiene "Pipeline de prospectos
    // calificados", "Propuesta comercial estructurada"… y ni una tarea.
    const krs: PasoLite[] = Array.from({ length: 4 }, () => ({ objectiveId: 'g1', kind: 'key_result', status: 'pendiente' }))
    expect(metaSinPlan([meta({})], krs, HOY)).not.toBeNull()
  })

  it('una tarea DESCARTADA tampoco cuenta como plan', () => {
    const pasos: PasoLite[] = [{ objectiveId: 'g1', kind: 'task', status: 'descartado' }]
    expect(metaSinPlan([meta({})], pasos, HOY)).not.toBeNull()
  })
})

describe('prioridad: aprieta la que vence antes', () => {
  it('elige la de límite más cercano', () => {
    const r = metaSinPlan([
      meta({ id: 'lejos', title: 'Lejana', targetDate: '2026-12-01' }),
      meta({ id: 'cerca', title: 'Cercana', targetDate: '2026-08-10' }),
    ], [], HOY)!
    expect(r.id).toBe('cerca')
  })

  it('las SIN fecha van al final: una meta sin plan y sin fecha es un deseo', () => {
    const r = metaSinPlan([
      meta({ id: 'sinfecha', title: 'Que me suban el sueldo', targetDate: null }),
      meta({ id: 'confecha', title: 'Con límite', targetDate: '2026-09-30' }),
    ], [], HOY)!
    expect(r.id).toBe('confecha')
  })

  it('si TODAS son sin fecha igual ofrece una', () => {
    const r = metaSinPlan([meta({ targetDate: null })], [], HOY)!
    expect(r.dias).toBeNull()
    expect(metaSinPlanLine(r)).toContain('no tiene ni un paso escrito')
  })

  it('una meta vencida lo dice', () => {
    expect(metaSinPlanLine(metaSinPlan([meta({ targetDate: '2026-07-25' })], [], HOY))).toContain('venció hace 7 días')
  })

  it('las no activas no cuentan', () => {
    for (const status of ['paused', 'completed', 'abandoned']) {
      expect(metaSinPlan([meta({ status })], [], HOY)).toBeNull()
    }
  })
})

describe('parsePlanPropuesto: estricto A PROPÓSITO', () => {
  it('lee el formato exigido', () => {
    const r = parsePlanPropuesto([
      '1. Listar 10 empresas objetivo del sector salud | 3',
      '2. Escribir el mensaje de primer contacto | 5',
      '3. Contactar a las 10 y agendar 3 llamadas | 12',
    ].join('\n'))
    expect(r).toHaveLength(3)
    expect(r[0]).toEqual({ title: 'Listar 10 empresas objetivo del sector salud', enDias: 3 })
  })

  it('la prosa NO se interpreta: se descarta', () => {
    // Estos pasos se ESCRIBEN en sus objetivos. Un parseo generoso le crearía
    // basura en el plan; devolver [] hace que el caller solo le muestre el texto.
    expect(parsePlanPropuesto('Te propongo que primero listes empresas y luego las contactes.')).toEqual([])
    expect(parsePlanPropuesto('1. Un paso sin días')).toEqual([])
    expect(parsePlanPropuesto('- Un paso | 3')).toEqual([])
  })

  it('descarta títulos absurdos y días imposibles', () => {
    expect(parsePlanPropuesto('1. corto | 3')).toEqual([])
    expect(parsePlanPropuesto(`1. ${'x'.repeat(200)} | 3`)).toEqual([])
    expect(parsePlanPropuesto('1. Un paso perfectamente válido | 999')).toEqual([])
    expect(parsePlanPropuesto('1. Un paso perfectamente válido | -3')).toEqual([])
  })

  it('corta en MAX_PASOS: más que eso es un muro, no un plan', () => {
    const muchos = Array.from({ length: 12 }, (_, i) => `${i + 1}. Un paso razonable número ${i} | ${i + 1}`).join('\n')
    expect(parsePlanPropuesto(muchos)).toHaveLength(MAX_PASOS)
  })

  it('no revienta con basura', () => {
    expect(parsePlanPropuesto('')).toEqual([])
    expect(parsePlanPropuesto(null as unknown as string)).toEqual([])
  })
})

describe('fechaEnDias', () => {
  it('convierte días en fecha', () => {
    expect(fechaEnDias(HOY, 0)).toBe('2026-08-01')
    expect(fechaEnDias(HOY, 12)).toBe('2026-08-13')
  })
  it('null si la base no parsea', () => {
    expect(fechaEnDias('no-es-fecha', 3)).toBeNull()
  })
})
