// SIR V2 — Tests del detector de desplome de afecto.
//
// El caso 1 es la data REAL de Diana (medida el 31-jul-2026): ratios de 26.5, 20, 18
// y 12.5 a principios de julio y un 0.3 el 30-jul. La media de 30 días daba 7.3 →
// "muy positivo" el día después de la pelea. Eso es lo que este módulo existe para
// no repetir.
import { describe, it, expect } from 'vitest'
import {
  detectAffectionDrop, affectionDropLine,
  VENTANA_RECIENTE, MIN_BASE, Z_DESPLOME,
} from './affectionDrop'
import type { DailySignal } from './types'

let n = 0
function dia(affection: number, positivityRatio: number, messageCount = 20): DailySignal {
  n += 1
  const d = new Date(Date.UTC(2026, 5, 1) + n * 86_400_000).toISOString().slice(0, 10)
  return {
    date: d, messageCount, avgLen: 40,
    somatic: 0, friction: 0, withdrawal: 0, sensitivity: 0, actions: 0, composite: 0,
    affection, positivityRatio,
  }
}
function serie(base: Array<[number, number]>, reciente: Array<[number, number]>): DailySignal[] {
  n = 0
  return [...base.map(([a, r]) => dia(a, r)), ...reciente.map(([a, r]) => dia(a, r))]
}
/** 20 días de base "sana" con variación pequeña pero real (MAD > 0). */
const BASE_SANA: Array<[number, number]> = Array.from({ length: 20 }, (_, i) =>
  [i % 2 === 0 ? 0.15 : 0.12, i % 2 === 0 ? 12 : 8] as [number, number])

describe('detectAffectionDrop — el caso REAL de Diana', () => {
  it('detecta el desplome que la media de 30 días llamaba "muy positivo"', () => {
    const s = serie(BASE_SANA, [[0.026, 1.0], [0.026, 0.3], [0.03, 1.5]])
    const d = detectAffectionDrop(s)!
    expect(d.motivos.length).toBeGreaterThan(0)
    expect(d.motivos).toContain('balance')
    expect(d.ratioReciente).toBeLessThan(1.2)
    expect(d.ratioBase).toBeGreaterThanOrEqual(3)
  })

  it('con las dos señales a la vez la marca como "marcada"', () => {
    const d = detectAffectionDrop(serie(BASE_SANA, [[0.0, 0.5], [0.0, 0.3], [0.01, 0.8]]))!
    expect(d.motivos).toEqual(expect.arrayContaining(['afecto', 'balance']))
    expect(d.severidad).toBe('marcada')
  })

  it('la línea sale como PREGUNTA y aclara que es lo escrito, no lo sentido', () => {
    const d = detectAffectionDrop(serie(BASE_SANA, [[0.026, 1.0], [0.026, 0.3], [0.03, 1.5]]))
    const linea = affectionDropLine('Diana Carolina Díaz Sánchez', d)!
    expect(linea).toContain('Diana')
    expect(linea).not.toContain('Carolina') // solo el primer nombre
    expect(linea).toMatch(/\?$/)
    expect(linea.toLowerCase()).toContain('no lo que se siente')
    // Nunca un veredicto sobre el sentimiento del otro.
    expect(linea.toLowerCase()).not.toContain('te quiere menos')
  })
})

describe('detectAffectionDrop — cuándo NO tiene que hablar', () => {
  it('se calla (null) si no hay base personal suficiente', () => {
    const corta = Array.from({ length: MIN_BASE - 1 }, () => [0.15, 10] as [number, number])
    expect(detectAffectionDrop(serie(corta, [[0.0, 0.2], [0.0, 0.2], [0.0, 0.2]]))).toBeNull()
  })

  it('null NO es "todo bien": con base y sin caída devuelve motivos vacíos', () => {
    const d = detectAffectionDrop(serie(BASE_SANA, [[0.14, 10], [0.15, 11], [0.13, 9]]))!
    expect(d.motivos).toEqual([])
    expect(affectionDropLine('Diana', d)).toBeNull()
  })

  it('no dispara en una relación que SIEMPRE tuvo balance bajo (no es un cambio)', () => {
    // Sin la condición de base sana, esto sonaría todos los días.
    const baseFloja: Array<[number, number]> = Array.from({ length: 20 }, (_, i) =>
      [i % 2 === 0 ? 0.02 : 0.01, i % 2 === 0 ? 1.1 : 0.9] as [number, number])
    const d = detectAffectionDrop(serie(baseFloja, [[0.02, 1.0], [0.01, 0.9], [0.02, 1.1]]))!
    expect(d.motivos).not.toContain('balance')
  })

  it('un solo día malo no alcanza: la ventana exige persistencia', () => {
    // Dos de los tres días recientes siguen bien → la MEDIANA no se mueve.
    const d = detectAffectionDrop(serie(BASE_SANA, [[0.15, 11], [0.0, 0.3], [0.14, 10]]))!
    expect(d.motivos).toEqual([])
  })

  it('ignora los días sin mensajes: un día sin hablar no es un día sin cariño', () => {
    const s = serie(BASE_SANA, [[0.14, 10], [0.15, 11], [0.13, 9]])
    s.push({ ...dia(0, 0), messageCount: 0 })
    const d = detectAffectionDrop(s)!
    expect(d.motivos).toEqual([])
  })
})

describe('detectAffectionDrop — bordes numéricos', () => {
  it('z = null si la base es perfectamente plana (MAD 0), sin inventar un infinito', () => {
    const plana: Array<[number, number]> = Array.from({ length: 20 }, () => [0.10, 10])
    const d = detectAffectionDrop(serie(plana, [[0.0, 0.3], [0.0, 0.3], [0.0, 0.3]]))!
    expect(d.z).toBeNull()
    // El balance igual la caza: por eso son dos motivos y no uno.
    expect(d.motivos).toContain('balance')
  })

  it('el z se compara contra el umbral declarado', () => {
    expect(Z_DESPLOME).toBe(-2)
    const d = detectAffectionDrop(serie(BASE_SANA, [[0.0, 0.5], [0.0, 0.3], [0.0, 0.4]]))!
    expect(d.z).not.toBeNull()
    expect(d.z!).toBeLessThanOrEqual(Z_DESPLOME)
  })

  it('ordena por fecha: el sustrato no garantiza orden ascendente', () => {
    const s = serie(BASE_SANA, [[0.026, 1.0], [0.026, 0.3], [0.03, 1.5]])
    const alRevés = [...s].reverse()
    expect(detectAffectionDrop(alRevés)).toEqual(detectAffectionDrop(s))
  })

  it('no revienta con entradas vacías o basura', () => {
    expect(detectAffectionDrop([])).toBeNull()
    expect(detectAffectionDrop(null as unknown as DailySignal[])).toBeNull()
    expect(affectionDropLine('Diana', null)).toBeNull()
  })

  it('la ventana reciente son 3 días activos', () => {
    expect(VENTANA_RECIENTE).toBe(3)
  })
})
