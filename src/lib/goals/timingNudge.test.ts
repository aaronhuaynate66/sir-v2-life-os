import { describe, it, expect } from 'vitest'
import { buildGoalTimingNudge, type GoalTimingCandidate } from './timingNudge'

const c = (o: Partial<GoalTimingCandidate> = {}): GoalTimingCandidate => ({
  personName: 'Dayana Yrribarren',
  goalTitle: 'Marlab factura anual',
  pendingAction: 'pedirle el contacto del proveedor',
  signalDetail: 'anda activa hoy',
  observedAt: '2026-07-22T10:00:00.000Z',
  ...o,
})

describe('buildGoalTimingNudge', () => {
  it('arma el nudge con el primer nombre + acción pendiente + objetivo', () => {
    const n = buildGoalTimingNudge([c()])
    expect(n).toContain('Buen momento con Dayana')
    expect(n).toContain('anda activa hoy')
    expect(n).toContain('pedirle el contacto del proveedor')
    expect(n).toContain('Marlab factura anual')
  })

  it('se queda con la señal MÁS reciente', () => {
    const n = buildGoalTimingNudge([
      c({ personName: 'Ana Vieja', observedAt: '2026-07-20T10:00:00.000Z' }),
      c({ personName: 'Beto Fresco', observedAt: '2026-07-22T09:00:00.000Z' }),
    ])
    expect(n).toContain('Beto')
    expect(n).not.toContain('Ana')
  })

  it('recorta acción y objetivo largos', () => {
    const n = buildGoalTimingNudge([c({
      pendingAction: 'x'.repeat(120),
      goalTitle: 'y'.repeat(80),
    })])
    expect(n).toContain('…')
    expect(n!.length).toBeLessThan(200)
  })

  it('ignora candidatos incompletos; null si no queda ninguno', () => {
    expect(buildGoalTimingNudge([c({ pendingAction: '' })])).toBeNull()
    expect(buildGoalTimingNudge([c({ personName: '  ' })])).toBeNull()
    expect(buildGoalTimingNudge([])).toBeNull()
  })

  it('mezcla válidos e inválidos → toma el válido', () => {
    const n = buildGoalTimingNudge([c({ goalTitle: '' }), c({ personName: 'Carla Buena' })])
    expect(n).toContain('Carla')
  })
})

// FRICCIÓN REAL (29-jul-2026). Aaron: "sigo sin entender por qué me habla de
// pasarle cotización de las cámaras, algo está mal y ya habíamos hablado de esto".
// Era `goals.next_action` escrito el 16-jun y nunca tocado — 43 días empujándolo
// como si fuera de ayer. Él ya lo había cuestionado el 24-jul y SIR le DEFENDIÓ el
// campo en vez de leer su duda como la señal de que estaba viejo.
describe('un pendiente VIEJO no se presenta como fresco', () => {
  const NOW = new Date('2026-07-29T12:00:00Z')
  const miluska = (goalUpdatedAt: string | null) => c({
    personName: 'Miluska Castillo', goalTitle: 'Cerrar clientes para Marlab',
    pendingAction: 'Pasarle cotización a Miluska (landing/cámaras)',
    signalDetail: 'anda activa hoy', observedAt: '2026-07-29T11:00:00Z',
    goalUpdatedAt,
  })

  it('EL CASO REAL: a 42 días sale, pero DICIENDO su edad y ofreciendo retirarlo', () => {
    // No se silencia: podría seguir siendo real. Pero decir la edad convierte
    // "¿de qué cotización me hablas?" en "ah, es de junio, ya no aplica".
    const r = buildGoalTimingNudge([miluska('2026-06-16T23:23:13Z')], NOW)!
    expect(r).toContain('hace 42 días')
    expect(r).toMatch(/dime si ya no aplica/)
  })

  it('un pendiente FRESCO no lleva la nota de edad', () => {
    const r = buildGoalTimingNudge([miluska('2026-07-27T10:00:00Z')], NOW)!
    expect(r).not.toMatch(/hace \d+ días/)
    expect(r).toContain('Miluska')
  })

  it('pasados 2 meses ya NO se propone: es un residuo, no un pendiente', () => {
    expect(buildGoalTimingNudge([miluska('2026-05-01T10:00:00Z')], NOW)).toBeNull()
  })

  it('sin fecha del objetivo se comporta como antes (no rompe lo que andaba)', () => {
    const r = buildGoalTimingNudge([miluska(null)], NOW)!
    expect(r).toContain('Miluska')
    expect(r).not.toMatch(/hace \d+ días/)
  })
})
