// SIR V2 — Tests del prefijo temporal del recordatorio.
//
// El cron pasó a mirar 36 h adelante porque `due_at <= now` con un cron diario avisaba
// hasta 23 h TARDE. Caso real: examen del IPD el 7-ago 8:10 am, se iba a avisar el
// 8-ago. Pero adelantar el aviso sin decir el día es peor: "Examen médico 8:10am"
// leído un día antes se entiende como hoy, y eso significa no ayunar ni imprimir nada.
import { describe, it, expect } from 'vitest'
import { textoRecordatorio, prefijoDeVencimiento, horaLima } from './cuandoVence'

// 31-jul-2026, 14:30 de Lima = 19:30 UTC.
const AHORA = Date.parse('2026-07-31T19:30:00Z')
const IPD = 'Examen médico EPP (IPD, San Luis) 8:10am. Ayuno 8h, NO desayunes.'

describe('textoRecordatorio — el caso real del IPD', () => {
  it('a 7 días dice el día de la semana y la hora', () => {
    // 7-ago 12:00 UTC = 7:00 am Lima, viernes.
    const t = textoRecordatorio(IPD, '2026-08-07T12:00:00Z', AHORA)
    expect(t).toContain('EL VIERNES')
    expect(t).toContain('7:00 am')
    expect(t).toContain('Ayuno 8h')
  })

  it('el día antes dice MAÑANA — que es lo que salva el ayuno', () => {
    const anoche = Date.parse('2026-08-06T19:30:00Z')
    expect(textoRecordatorio(IPD, '2026-08-07T12:00:00Z', anoche)).toContain('ES MAÑANA')
  })

  it('el mismo día NO agrega prefijo: sería ruido', () => {
    const esaManana = Date.parse('2026-08-07T11:00:00Z')
    expect(textoRecordatorio(IPD, '2026-08-07T12:00:00Z', esaManana)).toBe(IPD)
  })

  it('pasado mañana se dice así', () => {
    expect(prefijoDeVencimiento('2026-08-02T12:00:00Z', AHORA)).toBe('pasado mañana')
  })
})

describe('bordes', () => {
  it('algo ya vencido no lleva prefijo: manda el texto del recordatorio', () => {
    expect(prefijoDeVencimiento('2026-07-20T12:00:00Z', AHORA)).toBeNull()
  })

  it('sin fecha válida devuelve el texto tal cual', () => {
    expect(textoRecordatorio('algo', null, AHORA)).toBe('algo')
    expect(textoRecordatorio('algo', 'no-es-fecha', AHORA)).toBe('algo')
  })

  it('la hora se convierte a Lima (UTC-5), no a UTC', () => {
    // 12:00 UTC son 7:00 am en Lima.
    expect(horaLima(Date.parse('2026-08-07T12:00:00Z'))).toBe('7:00 am')
    // Medianoche UTC = 7:00 pm del día anterior en Lima.
    expect(horaLima(Date.parse('2026-08-07T00:00:00Z'))).toBe('7:00 pm')
    // Mediodía de Lima.
    expect(horaLima(Date.parse('2026-08-07T17:00:00Z'))).toBe('12:00 pm')
  })
})
