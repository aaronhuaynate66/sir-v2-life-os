// SIR V2 — Tests del tono que dice de cuándo es.
//
// Los números son los REALES de Diana, medidos contra producción el 7-ago-2026:
// su último apunte de interacción es del 31-jul 21:30 de Lima (valor 4; guardado como
// 2026-08-01T02:30Z), y el volumen diario de las
// dos semanas previas fue 179, 35, 1, 67, 41, 121, 82, 110, 181, 105, 62.
//
// El bloque que más importa es el último: este módulo NO puede convertirse en un
// veredicto sobre la relación. Es la condición que Aaron puso cuando pidió medir el
// afecto, y la investigación de ese día confirmó que ningún estudio valida
// "menos mensajes = menos amor".
import { describe, expect, it } from 'vitest'

import {
  frescuraDelTono, ritmoDelSustrato, lineaDeTono, sufijoDeFrescura,
  MIN_DIAS_BASE, type ApunteDeTono, type DiaDeMensajes,
} from './tonoDelSustrato'

// 7-ago-2026, 07:00 de Lima.
const AHORA = Date.parse('2026-08-07T12:00:00Z')

/** Los días reales de Diana, más relleno para llegar a base suficiente. */
function diasDeDiana(): DiaDeMensajes[] {
  const reales: DiaDeMensajes[] = [
    { dia: '2026-07-27', total: 179 }, { dia: '2026-07-28', total: 35 },
    { dia: '2026-07-29', total: 1 }, { dia: '2026-07-30', total: 67 },
    { dia: '2026-07-31', total: 41 }, { dia: '2026-08-01', total: 121 },
    { dia: '2026-08-02', total: 82 }, { dia: '2026-08-03', total: 110 },
    { dia: '2026-08-04', total: 181 }, { dia: '2026-08-05', total: 105 },
    { dia: '2026-08-06', total: 62 }, { dia: '2026-08-07', total: 16 }, // hoy, a medias
  ]
  // 14 días más de julio con volumen parecido, para pasar los 21 de base.
  const relleno: DiaDeMensajes[] = Array.from({ length: 14 }, (_, i) => ({
    dia: `2026-07-${String(i + 10).padStart(2, '0')}`, total: 80 + (i % 5) * 10,
  }))
  return [...relleno, ...reales]
}

const APUNTE_1AGO: ApunteDeTono[] = [
  { value: 2, loggedAt: '2026-07-29T12:45:00Z' },
  { value: 2, loggedAt: '2026-07-30T22:30:00Z' },
  { value: 3, loggedAt: '2026-07-31T16:30:00Z' },
  { value: 4, loggedAt: '2026-08-01T02:30:00Z' },
]

describe('el caso REAL de Diana: la etiqueta no está mal, está vieja', () => {
  it('detecta que la lectura del tono tiene días y hubo conversación sin leer', () => {
    const f = frescuraDelTono(APUNTE_1AGO, diasDeDiana(), AHORA)
    expect(f.ultimoApunte).toBe('2026-08-01T02:30:00Z')
    // OJO: el apunte es 2026-08-01T02:30Z = 31-jul 21:30 de LIMA. El día que cuenta
    // es el de Lima, así que son 7 días y la ventana arranca el 1-ago.
    expect(f.diaDelApunte).toBe('2026-07-31')
    expect(f.diasDesde).toBe(7)
    // Del 1 al 7 de agosto: 121+82+110+181+105+62+16
    expect(f.mensajesDesde).toBe(677)
    expect(f.rancio).toBe(true)
  })

  it('la línea DICE de cuándo es la lectura y termina en pregunta', () => {
    const f = frescuraDelTono(APUNTE_1AGO, diasDeDiana(), AHORA)
    const r = ritmoDelSustrato(diasDeDiana(), AHORA)
    const l = lineaDeTono('Diana Carolina Díaz Sánchez', f, r)!
    expect(l).toContain('Diana')
    expect(l).toContain('2026-07-31')
    expect(l).toContain('hace 7 días')
    expect(l.trimEnd().endsWith('?')).toBe(true)
  })

  it('el sufijo evita que "estable" se lea como si fuera de hoy', () => {
    const f = frescuraDelTono(APUNTE_1AGO, diasDeDiana(), AHORA)
    expect(sufijoDeFrescura(f)).toBe(' (según tu apunte del 2026-07-31)')
  })

  it('con la lectura FRESCA no dice nada y no pone sufijo', () => {
    const hoyMismo: ApunteDeTono[] = [{ value: 4, loggedAt: '2026-08-07T02:00:00Z' }]
    const f = frescuraDelTono(hoyMismo, diasDeDiana(), AHORA)
    expect(f.rancio).toBe(false)
    expect(sufijoDeFrescura(f)).toBe('')
    expect(lineaDeTono('Diana', f, ritmoDelSustrato(diasDeDiana(), AHORA))).toBeNull()
  })
})

describe('el ritmo se compara contra SU base, no contra un número inventado', () => {
  it('con los días reales de Diana el ritmo NO es una caída', () => {
    const r = ritmoDelSustrato(diasDeDiana(), AHORA)
    expect(r.suficiente).toBe(true)
    expect(r.medianaBase).toBeGreaterThan(0)
    expect(r.caida).toBe(false)
  })

  it('EL DÍA DE HOY se excluye: a las 07:00 lleva 16 y no es un día completo', () => {
    // Si contara, la mediana reciente se hundiría y daría una caída falsa.
    const r = ritmoDelSustrato(diasDeDiana(), AHORA)
    expect(r.medianaReciente).toBeGreaterThan(16)
  })

  it('una caída real SÍ se detecta, y la línea ofrece las causas inocentes', () => {
    const caida: DiaDeMensajes[] = [
      ...Array.from({ length: 25 }, (_, i) => ({ dia: `2026-07-${String(i + 1).padStart(2, '0')}`, total: 90 })),
      { dia: '2026-08-01', total: 8 }, { dia: '2026-08-02', total: 5 },
      { dia: '2026-08-03', total: 11 }, { dia: '2026-08-04', total: 6 },
      { dia: '2026-08-05', total: 9 }, { dia: '2026-08-06', total: 7 },
    ]
    const r = ritmoDelSustrato(caida, AHORA)
    expect(r.caida).toBe(true)
    const l = lineaDeTono('Diana', frescuraDelTono(APUNTE_1AGO, caida, AHORA), r)!
    expect(l).toContain('el ritmo bajó')
    expect(l).toContain('ocupado')
    expect(l).toContain('viendo en persona')
    expect(l.trimEnd().endsWith('?')).toBe(true)
  })

  it('sin base personal suficiente NO compara: nada de umbrales inventados', () => {
    const pocos: DiaDeMensajes[] = Array.from({ length: 5 }, (_, i) => ({
      dia: `2026-08-0${i + 1}`, total: 3,
    }))
    const r = ritmoDelSustrato(pocos, AHORA)
    expect(r.diasConDatos).toBeLessThan(MIN_DIAS_BASE)
    expect(r.suficiente).toBe(false)
    expect(r.medianaBase).toBeNull()
    expect(r.caida).toBe(false) // no se afirma una caída que no se puede sostener
  })
})

describe('NO es un veredicto — la condición que Aaron puso', () => {
  const conCaida: DiaDeMensajes[] = [
    ...Array.from({ length: 25 }, (_, i) => ({ dia: `2026-07-${String(i + 1).padStart(2, '0')}`, total: 90 })),
    { dia: '2026-08-05', total: 4 }, { dia: '2026-08-06', total: 3 },
  ]

  it('nunca dice nada sobre lo que la otra persona siente', () => {
    const l = lineaDeTono('Diana', frescuraDelTono(APUNTE_1AGO, conCaida, AHORA), ritmoDelSustrato(conCaida, AHORA)) ?? ''
    for (const prohibido of ['te quiere menos', 'menos amor', 'se está alejando', 'ya no', 'desinterés', 'te está dejando']) {
      expect(l.toLowerCase()).not.toContain(prohibido)
    }
  })

  it('TODA salida es una pregunta, nunca una conclusión', () => {
    for (const dias of [diasDeDiana(), conCaida]) {
      const l = lineaDeTono('Diana', frescuraDelTono(APUNTE_1AGO, dias, AHORA), ritmoDelSustrato(dias, AHORA))
      if (l) expect(l.trimEnd().endsWith('?'), l).toBe(true)
    }
  })

  it('no expone ningún número de "calidad": el módulo no juzga la relación', () => {
    const f = frescuraDelTono(APUNTE_1AGO, diasDeDiana(), AHORA)
    const r = ritmoDelSustrato(diasDeDiana(), AHORA)
    expect(Object.keys(f)).not.toContain('quality')
    expect(Object.keys(r)).not.toContain('quality')
    expect(Object.keys(r)).not.toContain('score')
  })
})

describe('bordes', () => {
  it('sin apuntes no inventa una fecha, y cuenta toda la ventana', () => {
    const f = frescuraDelTono([], diasDeDiana(), AHORA)
    expect(f.ultimoApunte).toBeNull()
    expect(f.diasDesde).toBeNull()
    expect(f.rancio).toBe(false) // sin lectura previa no hay nada "rancio" que avisar
    expect(f.mensajesDesde).toBeGreaterThan(0)
  })

  it('un apunte viejo SIN mensajes después no es rancio: la relación no tuvo movimiento', () => {
    const f = frescuraDelTono(APUNTE_1AGO, [], AHORA)
    expect(f.diasDesde).toBe(7)
    expect(f.mensajesDesde).toBe(0)
    expect(f.rancio).toBe(false)
  })

  it('no revienta con basura', () => {
    expect(() => frescuraDelTono(null as unknown as ApunteDeTono[], null as unknown as DiaDeMensajes[], AHORA)).not.toThrow()
    expect(frescuraDelTono([{ value: 4, loggedAt: 'no-es-fecha' }], [], AHORA).ultimoApunte).toBeNull()
    expect(ritmoDelSustrato(null as unknown as DiaDeMensajes[], AHORA).medianaReciente).toBeNull()
    expect(lineaDeTono('', frescuraDelTono([], [], AHORA), ritmoDelSustrato([], AHORA))).toBeNull()
  })
})
