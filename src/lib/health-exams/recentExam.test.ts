// SIR V2 — Tests del aviso de examen reciente.
//
// El caso que lo motivó: la tomografía del 27-jul-2026 entró con 11 recomendaciones,
// una de ellas con ventana de 5-7 días (hematoma septal), y el brief solo leía
// exámenes los LUNES y solo derivando de valores numéricos — que una tomografía no
// tiene. Era invisible por dos motivos a la vez.
import { describe, it, expect } from 'vitest'
import {
  examenRecienteLine, examenRecienteConRecomendaciones, cuandoFue, VENTANA_RECIENTE_DIAS,
} from './recentExam'
import type { HealthExam } from './types'

const HOY = '2026-07-31'

function exam(p: Partial<HealthExam> & { examDate: string }): HealthExam {
  return {
    id: p.examDate, examDate: p.examDate, provider: p.provider ?? null,
    title: p.title ?? 'Examen', summary: p.summary ?? null,
    findings: p.findings ?? [], values: p.values ?? [],
    recommendations: p.recommendations ?? [], pdfUrl: null,
  }
}

const TOMO = exam({
  examDate: '2026-07-27',
  title: 'TEM de emergencia — encéfalo + macizo facial',
  recommendations: [
    'BANDERA ROJA CON VENTANA DE DÍAS: descartar hematoma septal con endoscopia.',
    'Pedir SCOAT6.',
    'Confirmar si "sin fractura desplazada" excluye las no desplazadas.',
  ],
})

describe('examenRecienteLine — el caso real de la tomografía', () => {
  it('la surfacea con el conteo y la primera recomendación', () => {
    const l = examenRecienteLine([TOMO], HOY)!
    expect(l).toContain('TEM de emergencia')
    expect(l).toContain('3 recomendaciones')
    expect(l).toContain('hematoma septal')
    expect(l).toContain('hace 4 días')
  })

  it('invita a preguntar por el resto en vez de volcar las 11 (evita el muro de #1039)', () => {
    const l = examenRecienteLine([TOMO], HOY)!
    expect(l).toContain('pregúntame por las otras 2')
    // Solo UNA recomendación en la línea.
    expect(l).not.toContain('SCOAT6')
  })

  it('con una sola recomendación no invita a preguntar por el resto', () => {
    const uno = exam({ examDate: HOY, title: 'X', recommendations: ['Solo esta'] })
    const l = examenRecienteLine([uno], HOY)!
    expect(l).toContain('1 recomendación')
    expect(l).not.toContain('pregúntame')
  })
})

describe('examenRecienteLine — cuándo NO habla', () => {
  it('un examen sin recomendaciones no genera nada', () => {
    expect(examenRecienteLine([exam({ examDate: HOY, recommendations: [] })], HOY)).toBeNull()
    // Ni con strings vacíos.
    expect(examenRecienteLine([exam({ examDate: HOY, recommendations: ['', '  '] })], HOY)).toBeNull()
  })

  it('fuera de la ventana se calla: un examen viejo no es un pendiente de hoy', () => {
    const viejo = exam({ examDate: '2026-05-02', title: 'Preocupacional', recommendations: ['algo'] })
    expect(examenRecienteLine([viejo], HOY)).toBeNull()
  })

  it('el borde de la ventana entra, un día más no', () => {
    const borde = new Date(Date.parse(`${HOY}T00:00:00Z`) - VENTANA_RECIENTE_DIAS * 86_400_000)
      .toISOString().slice(0, 10)
    const fuera = new Date(Date.parse(`${HOY}T00:00:00Z`) - (VENTANA_RECIENTE_DIAS + 1) * 86_400_000)
      .toISOString().slice(0, 10)
    expect(examenRecienteLine([exam({ examDate: borde, recommendations: ['x'] })], HOY)).toBeTruthy()
    expect(examenRecienteLine([exam({ examDate: fuera, recommendations: ['x'] })], HOY)).toBeNull()
  })

  it('descarta fechas FUTURAS: es data mal cargada, no un pendiente', () => {
    expect(examenRecienteLine([exam({ examDate: '2026-08-15', recommendations: ['x'] })], HOY)).toBeNull()
  })

  it('no revienta con entradas vacías o basura', () => {
    expect(examenRecienteLine([], HOY)).toBeNull()
    expect(examenRecienteLine(null as unknown as HealthExam[], HOY)).toBeNull()
    expect(examenRecienteLine([exam({ examDate: 'no-es-fecha', recommendations: ['x'] })], HOY)).toBeNull()
  })
})

describe('examenRecienteConRecomendaciones — elección entre varios', () => {
  it('gana el más NUEVO', () => {
    const a = exam({ examDate: '2026-07-20', title: 'Viejo', recommendations: ['a'] })
    const b = exam({ examDate: '2026-07-29', title: 'Nuevo', recommendations: ['b'] })
    expect(examenRecienteConRecomendaciones([a, b], HOY)!.exam.title).toBe('Nuevo')
  })

  it('empatados en fecha gana el que trae MÁS recomendaciones (una emergencia emite varios informes)', () => {
    const corto = exam({ examDate: '2026-07-27', title: 'Corto', recommendations: ['a'] })
    const largo = exam({ examDate: '2026-07-27', title: 'Largo', recommendations: ['a', 'b', 'c'] })
    expect(examenRecienteConRecomendaciones([corto, largo], HOY)!.exam.title).toBe('Largo')
  })
})

describe('cuandoFue', () => {
  it('habla en días, no en fechas', () => {
    expect(cuandoFue(0)).toBe('de hoy')
    expect(cuandoFue(1)).toBe('de ayer')
    expect(cuandoFue(4)).toBe('de hace 4 días')
  })
})
