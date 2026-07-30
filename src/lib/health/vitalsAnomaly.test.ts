import { describe, it, expect } from 'vitest'
import { vitalsAnomaly, diasEmpeorandoSeguidos, DEFAULT_RANGES } from './vitalsAnomaly'

describe('vitalsAnomaly — carga fisiológica multi-señal', () => {
  it('null sin datos', () => {
    expect(vitalsAnomaly([])).toBeNull()
    expect(vitalsAnomaly([{ date: '2026-07-15' }])).toBeNull()
  })

  it('null con UNA sola señal desviada (es ruido)', () => {
    // Solo FC en reposo elevada; el resto en rango.
    expect(vitalsAnomaly([{ date: '2026-07-10', hrvAvg: 60, sleepingHr: 58, respRate: 15, highHrAlerts: 0 }])).toBeNull()
  })

  it('15-jul real (enfermo): 4 señales → alert', () => {
    const a = vitalsAnomaly([{ date: '2026-07-15', hrvAvg: 18, sleepingHr: 88, respRate: 20, highHrAlerts: 19 }])
    expect(a).not.toBeNull()
    expect(a!.severity).toBe('alert')
    expect(a!.signals.length).toBe(4)
    // El cierre de 'alert' ahora dice QUÉ HACER, que es lo que Aaron reclamó el
    // 19-jul ("me pones alerta y quiero saber qué tengo que hacer").
    expect(a!.text).toMatch(/no fuerces/i)
    expect(a!.text).toMatch(/hidrát|duerme/i)
  })

  it('14-jul (2 señales): FC sueño alta + muchas alertas → watch', () => {
    const a = vitalsAnomaly([{ date: '2026-07-14', hrvAvg: 54, sleepingHr: 58, respRate: 16, highHrAlerts: 12 }])
    expect(a).not.toBeNull()
    expect(a!.severity).toBe('watch')
    expect(a!.signals.length).toBe(2)
  })

  it('día sano → null', () => {
    expect(vitalsAnomaly([{ date: '2026-07-16', hrvAvg: 70, sleepingHr: 50, respRate: 15, highHrAlerts: 0 }])).toBeNull()
  })

  it('toma el día más reciente con datos (ignora huecos posteriores)', () => {
    const a = vitalsAnomaly([
      { date: '2026-07-15', hrvAvg: 18, sleepingHr: 88, respRate: 20, highHrAlerts: 19 },
      { date: '2026-07-16' }, // sin datos → se ignora, gana el 15
    ])
    expect(a).not.toBeNull()
    expect(a!.severity).toBe('alert')
  })

  it('umbral VFC: 54 no dispara (borde), 53 sí cuenta como baja', () => {
    // 54 = mínimo, no es < min → no adversa; sola no alcanza igual
    expect(vitalsAnomaly([{ date: 'x', hrvAvg: 54, sleepingHr: 50, respRate: 15, highHrAlerts: 0 }])).toBeNull()
    // 53 (VFC baja) + FC alta = 2 señales → watch
    const a = vitalsAnomaly([{ date: 'x', hrvAvg: 53, sleepingHr: 60, respRate: 15, highHrAlerts: 0 }])
    expect(a!.signals).toContain('VFC baja')
  })

  it('respeta rangos custom', () => {
    const ranges = { ...DEFAULT_RANGES, respRateMax: 25 }
    // con respRateMax=25, resp 20 ya no es adversa → solo 1 señal (FC) → null
    expect(vitalsAnomaly([{ date: 'x', hrvAvg: 60, sleepingHr: 58, respRate: 20, highHrAlerts: 0 }], ranges)).toBeNull()
  })
})

// El caso REAL del 29-jul-2026. Con la lógica vieja esto daba 'watch' y cerraba
// con "puede ser una noche floja": VFC 34 ms (su piso son 54, o sea 37% por
// debajo) y FC en sueño 68 (su techo 55), dos días después de un trauma facial y
// con tramadol. Y era el TERCER día seguido cayendo. Contar señales sin mirar
// cuánto se pasaron ni desde cuándo hace que una VFC de 53 y una de 34 den el
// mismo veredicto.
describe('magnitud y tendencia (el fallo del 29-jul)', () => {
  const serieReal = [
    { date: '2026-07-25', hrvAvg: 82, sleepingHr: 46, respRate: 16 },
    { date: '2026-07-26', hrvAvg: 90, sleepingHr: 47, respRate: 16 },
    { date: '2026-07-27', hrvAvg: 55, sleepingHr: 53, respRate: 17, highHrAlerts: 1 },
    { date: '2026-07-28', hrvAvg: 49, sleepingHr: 58, respRate: 16, highHrAlerts: 1 },
    { date: '2026-07-29', hrvAvg: 34, sleepingHr: 68, respRate: 16 },
  ]

  it('con 2 señales pero una MUY desviada → alert, no watch', () => {
    const a = vitalsAnomaly(serieReal)!
    expect(a.signals.length).toBe(2)
    expect(a.severity).toBe('alert')
  })

  it('cuenta los días seguidos empeorando y lo DICE', () => {
    const a = vitalsAnomaly(serieReal)!
    expect(a.diasEmpeorando).toBe(3)
    expect(a.text).toMatch(/3 días seguidos/i)
    expect(a.text).not.toMatch(/noche floja/i)
  })

  it('dice qué hacer, y con cita próxima manda a la consulta', () => {
    const a = vitalsAnomaly(serieReal, DEFAULT_RANGES, {
      eventoReciente: 'el golpe del lunes',
      citaProxima: 'tu cita de maxilofacial de mañana',
    })!
    expect(a.text).toMatch(/no fuerces/i)
    expect(a.text).toMatch(/el golpe del lunes/)
    expect(a.text).toMatch(/maxilofacial/)
  })

  it('2 señales apenas al borde SIGUEN siendo watch', () => {
    // Sin esto el guard escalaría todo y "alert" perdería significado.
    const a = vitalsAnomaly([{ date: '2026-07-14', hrvAvg: 53, sleepingHr: 56, respRate: 16 }])!
    expect(a.severity).toBe('watch')
    expect(a.diasEmpeorando).toBe(0)
  })
})

describe('diasEmpeorandoSeguidos', () => {
  it('corta la racha en el primer día que mejora', () => {
    expect(diasEmpeorandoSeguidos([
      { date: '2026-07-26', hrvAvg: 90, sleepingHr: 47 },
      { date: '2026-07-27', hrvAvg: 55, sleepingHr: 53 },
      { date: '2026-07-28', hrvAvg: 70, sleepingHr: 48 }, // mejoró
    ])).toBe(0)
  })

  it('ignora el ruido chico noche a noche', () => {
    expect(diasEmpeorandoSeguidos([
      { date: '2026-07-27', hrvAvg: 70, sleepingHr: 50 },
      { date: '2026-07-28', hrvAvg: 69, sleepingHr: 51 }, // -1 ms, +1 bpm
    ])).toBe(0)
  })

  it('un solo día con datos no es una racha', () => {
    expect(diasEmpeorandoSeguidos([{ date: '2026-07-29', hrvAvg: 34 }])).toBe(0)
  })
})
