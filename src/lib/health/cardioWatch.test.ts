import { describe, it, expect } from 'vitest'

import {
  assessCardio, computeBaseline, construirReporte,
  DIAS_SIN_RECUPERAR, type CardioDay, type CardioEvent,
} from './cardioWatch'

/** Serie real de Aaron, 22→30 jul 2026 (health_metrics, medida el 30-jul). */
const REAL: CardioDay[] = [
  { date: '2026-07-22', sleepingHr: 47, hrvAvg: 98 },
  { date: '2026-07-23', sleepingHr: 49, hrvAvg: 80 },
  { date: '2026-07-24', sleepingHr: 52, hrvAvg: 68 },
  { date: '2026-07-25', sleepingHr: 46, hrvAvg: 82 },
  { date: '2026-07-26', sleepingHr: 47, hrvAvg: 90 },
  { date: '2026-07-27', sleepingHr: 53, hrvAvg: 55 },
  { date: '2026-07-28', sleepingHr: 58, hrvAvg: 49 },
  { date: '2026-07-29', sleepingHr: 68, hrvAvg: 34 },
  { date: '2026-07-30', sleepingHr: 48, hrvAvg: 82, spo2: 98, respRate: 15 },
]
const GOLPE: CardioEvent[] = [
  { date: '2026-07-27', label: 'traumatismo facial (golpe del 27-jul)', ventanaDias: 10 },
]

/** Genera una serie plana y sana, para construir escenarios encima. */
function sana(n: number, desde = '2026-06-01'): CardioDay[] {
  const out: CardioDay[] = []
  const t0 = Date.parse(`${desde}T00:00:00Z`)
  for (let i = 0; i < n; i++) {
    out.push({
      date: new Date(t0 + i * 86_400_000).toISOString().slice(0, 10),
      sleepingHr: 48 + (i % 3), hrvAvg: 80 - (i % 5),
    })
  }
  return out
}

describe('computeBaseline', () => {
  it('usa MEDIANA, así un día malo no mueve el piso', () => {
    const b = computeBaseline(REAL)!
    expect(b.n).toBe(9)
    // Con promedio el 68/34 del 29-jul arrastraría la base; con mediana no.
    expect(b.sleepingHr).toBe(49)
    expect(b.hrvAvg).toBe(80)
  })

  it('sin datos devuelve null en vez de inventar 0', () => {
    expect(computeBaseline([])).toBeNull()
    expect(computeBaseline([{ date: '2026-07-01' }])).toBeNull()
  })
})

describe('assessCardio — el caso REAL del 27→30 jul', () => {
  it('NO manda al cardiólogo: se recuperó solo', () => {
    const v = assessCardio(REAL, { eventos: GOLPE })
    expect(v.level).toBe('observar')
    expect(v.findings).toHaveLength(0)
    // Tiene que decir explícitamente que no hay nada que llevar.
    expect(v.text).toMatch(/volvieron a tu rango normal/i)
    expect(v.text).toMatch(/no hay nada acá que llevarle a un cardiólogo/i)
  })

  it('nombra el episodio que ya pasó y lo ata al golpe', () => {
    const v = assessCardio(REAL, { eventos: GOLPE })
    expect(v.text).toContain('2026-07-27')
    expect(v.text).toContain('2026-07-29')
    expect(v.text).toMatch(/traumatismo facial/)
  })

  it('el mismo tramo SIN el día de recuperación sí se ve mal, pero explicado', () => {
    const hasta29 = REAL.slice(0, -1)
    const v = assessCardio(hasta29, { eventos: GOLPE })
    expect(v.level).toBe('observar')
    expect(v.findings.map((f) => f.pattern)).toContain('vfc_deprimida_sostenida')
    // Explicado por el golpe → NO escala, y lo dice.
    expect(v.text).toMatch(/traumatismo facial/)
    expect(v.text).toMatch(/no el corazón/)
  })

  it('ese mismo tramo SIN evento registrado tampoco escala: 3 días es corto', () => {
    // Cambia el DISCURSO, no el nivel. Sin evento no se le puede atribuir a nada,
    // pero 3 días es indistinguible de un virus que no dio la cara: mandar al
    // cardiólogo acá sería exactamente el falso positivo que hay que evitar.
    const hasta29 = REAL.slice(0, -1)
    const v = assessCardio(hasta29, { eventos: [] })
    expect(v.level).toBe('observar')
    expect(v.findings.map((f) => f.pattern)).toContain('vfc_deprimida_sostenida')
    expect(v.text).not.toMatch(/traumatismo/)
    expect(v.text).toMatch(/corto para sacar conclusiones/)
  })

  it('el MISMO patrón, 12 días: explicado no escala, sin explicar sí', () => {
    // El corazón del diseño en un solo test. La única diferencia entre los dos
    // casos es si hay un evento registrado que cubra la ventana.
    const largo: CardioDay[] = []
    const t0 = Date.parse('2026-06-01T00:00:00Z')
    for (let i = 0; i < 24; i++) {
      const mal = i >= 12
      largo.push({
        date: new Date(t0 + i * 86_400_000).toISOString().slice(0, 10),
        sleepingHr: mal ? 70 : 48, hrvAvg: mal ? 30 : 80,
      })
    }
    const sinExplicar = assessCardio(largo)
    expect(sinExplicar.level).toBe('consultar')
    expect(sinExplicar.findings.map((f) => f.pattern)).toContain('sin_recuperacion')

    const explicado = assessCardio(largo, {
      eventos: [{ date: largo[12].date, label: 'dengue', ventanaDias: 20 }],
    })
    expect(explicado.level).toBe('observar')
    expect(explicado.text).toMatch(/dengue/)
  })
})

describe('assessCardio — no escalar por ruido', () => {
  it('una serie sana no dice nada', () => {
    const v = assessCardio(sana(30))
    expect(v.level).toBe('ninguno')
    expect(v.text).toBeNull()
  })

  it('un solo día fuera de rango NO alcanza', () => {
    const s = sana(20)
    s[s.length - 1] = { date: s[s.length - 1].date, sleepingHr: 70, hrvAvg: 30 }
    const v = assessCardio(s)
    expect(v.level).not.toBe('consultar')
    expect(v.findings).toHaveLength(0)
  })

  it('dos días tampoco (el umbral es 3)', () => {
    const s = sana(20)
    for (const i of [s.length - 2, s.length - 1]) {
      s[i] = { date: s[i].date, sleepingHr: 70, hrvAvg: 30 }
    }
    expect(assessCardio(s).level).not.toBe('consultar')
  })

  it('menos de 3 días de historia no produce veredicto', () => {
    const v = assessCardio([{ date: '2026-07-29', sleepingHr: 80, hrvAvg: 20 }])
    expect(v.level).toBe('ninguno')
  })
})

describe('assessCardio — cuándo SÍ manda al especialista', () => {
  it('desviación sostenida sin explicación y sin recuperar → consultar', () => {
    const s = sana(20)
    for (let i = s.length - DIAS_SIN_RECUPERAR - 2; i < s.length; i++) {
      s[i] = { date: s[i].date, sleepingHr: 72, hrvAvg: 28 }
    }
    const v = assessCardio(s)
    expect(v.level).toBe('consultar')
    expect(v.findings.map((f) => f.pattern)).toContain('sin_recuperacion')
  })

  it('un evento con ventana VENCIDA ya no sirve de excusa', () => {
    const s = sana(20)
    for (let i = s.length - 12; i < s.length; i++) {
      s[i] = { date: s[i].date, sleepingHr: 72, hrvAvg: 28 }
    }
    // Evento viejo, ventana de 3 días: no cubre el día de hoy.
    const v = assessCardio(s, { eventos: [{ date: s[0].date, label: 'gripe', ventanaDias: 3 }] })
    expect(v.level).toBe('consultar')
  })

  it('deriva de la línea base: la racha no la ve, esto sí', () => {
    // Quincena previa a 48; la reciente a 56. Nunca hay 3 días "fuera de techo"
    // porque el techo se calcula sobre la mediana global — lo que se movió es el piso.
    const dias: CardioDay[] = []
    const t0 = Date.parse('2026-06-01T00:00:00Z')
    for (let i = 0; i < 28; i++) {
      dias.push({
        date: new Date(t0 + i * 86_400_000).toISOString().slice(0, 10),
        sleepingHr: i < 14 ? 48 : 56, hrvAvg: 80,
      })
    }
    const v = assessCardio(dias)
    expect(v.findings.map((f) => f.pattern)).toContain('deriva_de_linea_base')
    expect(v.level).toBe('consultar')
  })
})

describe('assessCardio — separa el eje respiratorio del cardíaco', () => {
  it('SpO2 baja + respiración alta NO se vende como problema del corazón', () => {
    const s = sana(20)
    s[s.length - 1] = { date: s[s.length - 1].date, sleepingHr: 49, hrvAvg: 79, spo2: 90, respRate: 21 }
    const v = assessCardio(s)
    const resp = v.findings.find((f) => f.pattern === 'senal_respiratoria')
    expect(resp).toBeDefined()
    expect(resp!.detalle).toMatch(/no al corazón/)
    // Solo esa señal no escala a cardiólogo.
    expect(v.level).not.toBe('consultar')
  })
})

describe('assessCardio — huecos de datos', () => {
  it('un día sin dato no corta la racha ni la infla', () => {
    const s = sana(20)
    const n = s.length
    s[n - 4] = { date: s[n - 4].date, sleepingHr: 72, hrvAvg: 28 }
    s[n - 3] = { date: s[n - 3].date } // noche sin medir
    s[n - 2] = { date: s[n - 2].date, sleepingHr: 72, hrvAvg: 28 }
    s[n - 1] = { date: s[n - 1].date, sleepingHr: 72, hrvAvg: 28 }
    const v = assessCardio(s)
    const f = v.findings.find((x) => x.pattern === 'vfc_deprimida_sostenida')
    expect(f?.dias).toBe(3) // 3 días con dato, el hueco no cuenta como día malo
  })

  it('fechas duplicadas o desordenadas no rompen nada', () => {
    const v = assessCardio([...REAL].reverse().concat(REAL[8]), { eventos: GOLPE })
    expect(v.level).toBe('observar')
    expect(v.baseline!.n).toBe(9)
  })
})

describe('construirReporte', () => {
  it('trae línea base, serie, contexto y qué se descartó', () => {
    const v = assessCardio(REAL, { eventos: GOLPE })
    const r = construirReporte(v, REAL, { eventos: GOLPE, hoy: '2026-07-30' })
    expect(r).toMatch(/REPORTE DE SEÑALES CARDÍACAS/)
    expect(r).toMatch(/NO es un diagnóstico/)
    expect(r).toMatch(/LÍNEA BASE/)
    expect(r).toMatch(/FC en sueño: 49 bpm/)
    expect(r).toMatch(/VFC \(variabilidad\): 80 ms/)
    expect(r).toMatch(/2026-07-29/)
    expect(r).toMatch(/traumatismo facial/)
    expect(r).toMatch(/QUÉ SE DESCARTÓ/)
    expect(r).toMatch(/báscula de pie/)
  })

  it('las preguntas cambian según el nivel', () => {
    const s = sana(20)
    for (let i = s.length - 12; i < s.length; i++) {
      s[i] = { date: s[i].date, sleepingHr: 72, hrvAvg: 28 }
    }
    const grave = construirReporte(assessCardio(s), s)
    expect(grave).toMatch(/Holter/)
    const calmo = construirReporte(assessCardio(REAL, { eventos: GOLPE }), REAL)
    expect(calmo).not.toMatch(/Holter/)
    expect(calmo).toMatch(/cuándo volver/)
  })

  it('NUNCA nombra una enfermedad ni propone un diagnóstico', () => {
    const s = sana(20)
    for (let i = s.length - 12; i < s.length; i++) {
      s[i] = { date: s[i].date, sleepingHr: 72, hrvAvg: 28 }
    }
    const textos = [
      construirReporte(assessCardio(s), s),
      assessCardio(s).text ?? '',
      assessCardio(REAL, { eventos: GOLPE }).text ?? '',
    ].join('\n').toLowerCase()
    for (const prohibido of [
      'arritmia', 'infarto', 'insuficiencia', 'miocard', 'fibrilación',
      'hipertensión', 'cardiopatía', 'taquicardia sinusal', 'diagnóstico de',
      'tienes un', 'probablemente sea',
    ]) {
      expect(textos).not.toContain(prohibido)
    }
  })

  it('sin datos lo dice, no arma un reporte vacío', () => {
    const v = assessCardio([])
    expect(construirReporte(v, [])).toMatch(/no hay suficientes noches/i)
  })
})
