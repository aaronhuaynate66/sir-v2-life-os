// SIR V2 — Tests del vigilante de crons.
//
// El caso real: `status-diff` se saltó el 26, 30 y 31 de julio de 2026 y nadie lo
// notó en 6 días. Las fechas de acá son ésas.
import { describe, it, expect } from 'vitest'
import {
  trabajosAtrasados, noVerificables, saludDeCronsLine, VIGILADOS,
  type EstadoDeTrabajo,
} from './salud'

const OK = (job: string, ultimoDia: string | null): EstadoDeTrabajo =>
  ({ job, ultimoDia, verificable: true })

describe('el caso que lo motivó', () => {
  it('el 1-ago, con evidencia del 29-jul, canta 3 días de silencio', () => {
    const a = trabajosAtrasados([OK('status-diff', '2026-07-29'), OK('morning-push', '2026-08-01')], '2026-08-01')
    expect(a).toHaveLength(1)
    expect(a[0].job).toBe('status-diff')
    expect(a[0].dias).toBe(3)
  })

  it('la línea habla de lo que HACE, no del nombre del cron', () => {
    const a = trabajosAtrasados([OK('status-diff', '2026-07-29')], '2026-08-01')
    const l = saludDeCronsLine(a)!
    expect(l).toContain('cómo viene cada relación')
    expect(l).not.toContain('status-diff')
    // No lo culpa a él ni lo asusta con pérdida de data.
    expect(l).toContain('no es data tuya')
  })

  it('con todo al día se calla', () => {
    const estados = [OK('status-diff', '2026-08-01'), OK('morning-push', '2026-08-01')]
    expect(trabajosAtrasados(estados, '2026-08-01')).toEqual([])
    expect(saludDeCronsLine([], [])).toBeNull()
  })
})

describe('tolerancia: un día perdido no es una falla', () => {
  it('un solo día de hueco NO alarma (puede ser ventana de deploy)', () => {
    // El 31-jul hubo 13 merges; los crons se re-registran en cada despliegue.
    expect(trabajosAtrasados([OK('status-diff', '2026-07-31')], '2026-08-01')).toEqual([])
  })

  it('dos días seguidos SÍ: ya es patrón', () => {
    const a = trabajosAtrasados([OK('status-diff', '2026-07-30')], '2026-08-01')
    expect(a).toHaveLength(1)
    expect(a[0].dias).toBe(2)
  })
})

describe('la regla dura: "no corrió" ≠ "no lo puedo verificar"', () => {
  const roto: EstadoDeTrabajo = { job: 'status-diff', ultimoDia: null, verificable: false }

  it('si la consulta falló, NO lo declara caído', () => {
    expect(trabajosAtrasados([roto, OK('morning-push', '2026-08-01')], '2026-08-01')).toEqual([])
  })

  it('lo reporta aparte, y la línea dice que no lo VE, no que esté caído', () => {
    const nv = noVerificables([roto, OK('morning-push', '2026-08-01')])
    expect(nv.map((v) => v.job)).toEqual(['status-diff'])
    const l = saludDeCronsLine([], nv)!
    expect(l).toContain('No pude verificar')
    expect(l).toContain('no lo veo')
    expect(l).not.toContain('días sin correr')
  })

  it('una medición que falta se trata como no verificable, no como caída', () => {
    // Si el brief no llegó a medir un trabajo, callarse es lo correcto.
    expect(trabajosAtrasados([], '2026-08-01')).toEqual([])
    expect(noVerificables([]).length).toBe(VIGILADOS.length)
  })

  it('verificable Y sin ninguna evidencia SÍ es información', () => {
    const a = trabajosAtrasados([OK('status-diff', null), OK('morning-push', '2026-08-01')], '2026-08-01')
    expect(a).toHaveLength(1)
    expect(a[0].dias).toBe(Infinity)
    expect(saludDeCronsLine(a)).toContain('nunca dejó rastro')
  })
})

describe('a quién vigila', () => {
  it('solo trabajos con evidencia diaria INCONDICIONAL', () => {
    // moment-scan y opportunities quedan fuera: hay días en que legítimamente no
    // encuentran nada, y su silencio no prueba una falla.
    const jobs = VIGILADOS.map((v) => v.job)
    expect(jobs).toContain('status-diff')
    expect(jobs).not.toContain('moment-scan')
    expect(jobs).not.toContain('opportunities')
  })

  it('ordena por gravedad: el más mudo primero', () => {
    const a = trabajosAtrasados(
      [OK('status-diff', '2026-07-30'), OK('morning-push', '2026-07-20')], '2026-08-01')
    expect(a[0].job).toBe('morning-push')
  })
})

describe('no revienta', () => {
  it('con basura', () => {
    expect(trabajosAtrasados(null as unknown as EstadoDeTrabajo[], '2026-08-01')).toEqual([])
    expect(trabajosAtrasados([OK('status-diff', 'no-es-fecha')], '2026-08-01')).toEqual([])
    expect(saludDeCronsLine([], [])).toBeNull()
    expect(saludDeCronsLine(null as unknown as [], [])).toBeNull()
  })
})
