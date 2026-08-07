import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  VERSION_EXTENSION,
  comparaVersiones,
  estadoDeVersion,
  lineaDeVersionVieja,
} from './versionExtension'

// ═══ EL CANDADO ═════════════════════════════════════════════════════════════
//
// Esto es lo que faltó en #1115: se tocó el lector de Instagram por los dos lados
// (MAIN e ISOLATED) y NO se subió la versión del manifest. Resultado: `ext_version`
// siguió diciendo `0.9.0` para el build de antes y para el de después, y ocho días
// más tarde no había forma de saber cuál de los dos estaba corriendo en la otra PC
// — que es exactamente la pregunta que #1115 venía a contestar.
//
// Este test hace que ese olvido sea imposible sin poner el CI en rojo.
describe('la constante y el manifest no se pueden separar', () => {
  it('VERSION_EXTENSION es idéntica a la del manifest.json de verdad', () => {
    const p = path.join(process.cwd(), 'extension', 'sir-reader', 'manifest.json')
    const manifest = JSON.parse(fs.readFileSync(p, 'utf8')) as { version?: string }
    expect(manifest.version).toBe(VERSION_EXTENSION)
  })
})

describe('comparaVersiones', () => {
  // EL caso: 0.9.0 es la que corre allá y 0.10.0 la del repo. Comparadas como
  // texto, '0.9.0' > '0.10.0' y el veredicto habría sido "al día" con la extensión
  // ocho días atrás — la alarma diciendo que todo está bien.
  it('0.9.0 es MENOR que 0.10.0 (numérico, no alfabético)', () => {
    expect(comparaVersiones('0.9.0', '0.10.0')).toBeLessThan(0)
    expect('0.9.0' > '0.10.0').toBe(true) // el bug que evitamos, explícito
  })

  it('iguales dan 0, y la v de prefijo no cambia nada', () => {
    expect(comparaVersiones('0.10.0', '0.10.0')).toBe(0)
    expect(comparaVersiones('v0.10.0', '0.10.0')).toBe(0)
  })

  it('tolera largos distintos: 0.10 == 0.10.0', () => {
    expect(comparaVersiones('0.10', '0.10.0')).toBe(0)
    expect(comparaVersiones('1', '0.99.99')).toBeGreaterThan(0)
  })
})

describe('estadoDeVersion', () => {
  it('la otra PC en 0.9.0 contra el repo en 0.10.0 → vieja', () => {
    const v = estadoDeVersion(['0.9.0', '0.9.0', null, '0.9.0'], '0.10.0')
    expect(v.estado).toBe('vieja')
    expect(v.instalada).toBe('0.9.0')
  })

  it('se queda con la MÁS ALTA: una pestaña muerta no dispara la alarma', () => {
    // Outlook lleva 8 días sin latir y su fila reporta null; WhatsApp late cada
    // 5 minutos con la versión buena. Quedarse con la más baja diría "vieja" por
    // culpa de una fila congelada, y sería una alarma falsa todos los días.
    const v = estadoDeVersion([null, '0.10.0', null], '0.10.0')
    expect(v.estado).toBe('al-dia')
    expect(v.instalada).toBe('0.10.0')
  })

  it('sin ninguna versión válida dice NO SÉ, no "al día"', () => {
    for (const caso of [[], [null, undefined], ['', 'latest', 'no-se']]) {
      const v = estadoDeVersion(caso as Array<string | null>, '0.10.0')
      expect(v.estado).toBe('no-se')
      expect(v.instalada).toBeNull()
    }
  })

  it('si va adelante del repo, lo dice sin llamarlo problema', () => {
    expect(estadoDeVersion(['0.11.0'], '0.10.0').estado).toBe('adelantada')
  })
})

describe('lineaDeVersionVieja', () => {
  it('solo habla cuando está atrás, y dice QUÉ hacer', () => {
    const l = lineaDeVersionVieja(estadoDeVersion(['0.9.0'], '0.10.0'))!
    expect(l).toContain('0.9.0')
    expect(l).toContain('0.10.0')
    expect(l).toContain('recargar la extensión')
    expect(l).toContain('extension/sir-reader')
  })

  it('calla en los otros tres casos', () => {
    for (const c of [['0.10.0'], ['0.11.0'], []]) {
      expect(lineaDeVersionVieja(estadoDeVersion(c as string[], '0.10.0'))).toBeNull()
    }
  })

  it('sin voseo (regla dura del repo)', () => {
    const l = lineaDeVersionVieja(estadoDeVersion(['0.9.0'], '0.10.0'))!
    expect(/\b(tenés|querés|podés|andá|fijate|revisá|copiá|recargá)\b/i.test(l)).toBe(false)
  })
})
