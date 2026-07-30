import { describe, it, expect } from 'vitest'

import { decidirCanal, puedeAvisar, SILENCIO_AHORA_DIAS, SILENCIO_CONSULTAR_DIAS } from './cardioSurface'
import { assessCardio, type CardioDay, type CardioVerdict } from './cardioWatch'

function serie(n: number, f: (i: number) => Partial<CardioDay>): CardioDay[] {
  const t0 = Date.parse('2026-06-01T00:00:00Z')
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(t0 + i * 86_400_000).toISOString().slice(0, 10),
    ...f(i),
  }))
}
const SANA = (i: number) => ({ sleepingHr: 48 + (i % 3), hrvAvg: 80 - (i % 5) })

describe('decidirCanal — la política de interrupción', () => {
  it('nivel consultar → AHORA y CON reporte (hay algo que agendar)', () => {
    const s = serie(24, (i) => (i >= 12 ? { sleepingHr: 70, hrvAvg: 30 } : SANA(i)))
    const a = decidirCanal(assessCardio(s))
    expect(a.canal).toBe('ahora')
    expect(a.conReporte).toBe(true)
    expect(a.fingerprint).toBe('cardio:consultar')
    expect(a.titulo).toBeTruthy()
  })

  it('anomalía aguda de un día → AHORA pero SIN reporte (no hay consulta)', () => {
    // El 15-jul real: VFC 18 con base ~66, FC en sueño 88.
    const s = serie(20, SANA)
    s[s.length - 1] = { date: s[s.length - 1].date, sleepingHr: 88, hrvAvg: 18 }
    const v = assessCardio(s)
    const a = decidirCanal(v)
    expect(a.canal).toBe('ahora')
    expect(a.conReporte).toBe(false)
    expect(a.fingerprint).toBe('cardio:aguda')
    // Y lo que dice tiene que servir HOY, no asustar.
    expect(a.texto).toMatch(/no cargues/i)
    expect(a.texto).toMatch(/casi nunca es del corazón/i)
  })

  it('una racha corta o explicada → MAÑANA, no interrumpe', () => {
    const real: CardioDay[] = [
      { date: '2026-07-22', sleepingHr: 47, hrvAvg: 98 },
      { date: '2026-07-23', sleepingHr: 49, hrvAvg: 80 },
      { date: '2026-07-24', sleepingHr: 52, hrvAvg: 68 },
      { date: '2026-07-25', sleepingHr: 46, hrvAvg: 82 },
      { date: '2026-07-26', sleepingHr: 47, hrvAvg: 90 },
      { date: '2026-07-27', sleepingHr: 53, hrvAvg: 55 },
      { date: '2026-07-28', sleepingHr: 58, hrvAvg: 49 },
      { date: '2026-07-29', sleepingHr: 68, hrvAvg: 34 },
    ]
    const v = assessCardio(real, {
      eventos: [{ date: '2026-07-27', label: 'traumatismo facial', ventanaDias: 10 }],
    })
    const a = decidirCanal(v)
    // OJO: el 29 la VFC cayó 34 contra una referencia de ~84 → eso ES agudo, y
    // agudo manda. Es correcto: ese día sí había que decirle "no entrenes".
    expect(a.canal).toBe('ahora')
    expect(a.fingerprint).toBe('cardio:aguda')
    expect(a.texto).toMatch(/traumatismo facial/)
  })

  it('la buena noticia ("ya pasó") va al REPORTE, no al push', () => {
    // Este es el caso real del 30-jul. Que NO suene es la decisión de diseño:
    // gastar una interrupción en decir "estás bien" quema el canal.
    const real: CardioDay[] = [
      { date: '2026-07-26', sleepingHr: 47, hrvAvg: 90 },
      { date: '2026-07-27', sleepingHr: 53, hrvAvg: 55 },
      { date: '2026-07-28', sleepingHr: 58, hrvAvg: 49 },
      { date: '2026-07-29', sleepingHr: 68, hrvAvg: 34 },
      { date: '2026-07-30', sleepingHr: 48, hrvAvg: 82 },
    ]
    const a = decidirCanal(assessCardio(real, {
      eventos: [{ date: '2026-07-27', label: 'traumatismo facial', ventanaDias: 10 }],
    }))
    expect(a.canal).toBe('reporte')
    expect(a.fingerprint).toBe('cardio:recuperado')
    expect(a.texto).toMatch(/volvieron a tu rango normal/i)
  })

  it('sin nada que decir → nada', () => {
    const a = decidirCanal(assessCardio(serie(30, SANA)))
    expect(a.canal).toBe('nada')
    expect(a.texto).toBe('')
  })

  it('un veredicto sin texto nunca produce aviso', () => {
    const vacio: CardioVerdict = { level: 'consultar', findings: [], text: null, baseline: null }
    expect(decidirCanal(vacio).canal).toBe('nada')
  })

  it('la señal respiratoria no se disfraza de cardíaca', () => {
    const s = serie(20, SANA)
    s[s.length - 1] = { date: s[s.length - 1].date, sleepingHr: 49, hrvAvg: 79, spo2: 90, respRate: 21 }
    const a = decidirCanal(assessCardio(s))
    expect(a.canal).toBe('manana')
    expect(a.fingerprint).toBe('cardio:respiratorio')
    expect(a.texto).toMatch(/no al corazón/)
  })
})

describe('puedeAvisar — el canal que interrumpe se gasta una vez', () => {
  const s = serie(20, SANA)
  s[s.length - 1] = { date: s[s.length - 1].date, sleepingHr: 88, hrvAvg: 18 }
  const agudo = decidirCanal(assessCardio(s))
  const ahora = new Date('2026-07-30T12:00:00Z')

  it('nunca enviado → se puede', () => {
    expect(puedeAvisar(agudo, null, ahora)).toBe(true)
  })

  it('enviado hoy → NO se repite', () => {
    expect(puedeAvisar(agudo, '2026-07-30T06:00:00Z', ahora)).toBe(false)
  })

  it(`pasados ${SILENCIO_AHORA_DIAS} días vuelve a sonar si sigue vigente`, () => {
    const hace2 = new Date(ahora.getTime() - SILENCIO_AHORA_DIAS * 86_400_000).toISOString()
    expect(puedeAvisar(agudo, hace2, ahora)).toBe(true)
  })

  it('el de consultar espera MÁS: ya lo sabe, repetirlo es el muro', () => {
    const consultarSerie = serie(24, (i) => (i >= 12 ? { sleepingHr: 70, hrvAvg: 30 } : SANA(i)))
    const c = decidirCanal(assessCardio(consultarSerie))
    const hace3 = new Date(ahora.getTime() - 3 * 86_400_000).toISOString()
    expect(puedeAvisar(c, hace3, ahora)).toBe(false)
    const hace8 = new Date(ahora.getTime() - (SILENCIO_CONSULTAR_DIAS + 1) * 86_400_000).toISOString()
    expect(puedeAvisar(c, hace8, ahora)).toBe(true)
  })

  it('los canales que NO interrumpen nunca pasan por acá', () => {
    const rep = decidirCanal(assessCardio([
      { date: '2026-07-28', sleepingHr: 58, hrvAvg: 49 },
      { date: '2026-07-29', sleepingHr: 68, hrvAvg: 34 },
      { date: '2026-07-30', sleepingHr: 48, hrvAvg: 82 },
    ]))
    expect(puedeAvisar(rep, null, ahora)).toBe(false)
  })

  it('una fecha basura no bloquea el aviso', () => {
    expect(puedeAvisar(agudo, 'no-es-fecha', ahora)).toBe(true)
  })
})
