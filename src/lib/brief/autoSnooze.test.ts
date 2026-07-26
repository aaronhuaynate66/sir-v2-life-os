import { describe, it, expect } from 'vitest'
import { applyAutoSnooze, previousDay, daysBetweenKeys, type BriefSignalHistory } from './autoSnooze'
import { signalTopicKey, type MorningSignal } from '@/lib/push/morning'
import { muteRef } from '@/lib/telegram/briefThread'

const MAMA = 'Con Maria Isabel Espinoza Vidaurre: "Conflicto por el Mundial de Bomberos" ya parece resuelto — ¿lo cierras?'
const TAREA = 'Hoy vence: Hacer UAT con Dayana'

const sig = (text: string, slot = 'momentResolution'): MorningSignal => ({ slot, section: 'gente', text })
const hist = (text: string, over: Partial<BriefSignalHistory> = {}, slot = 'momentResolution'): BriefSignalHistory => ({
  ref: muteRef(text, slot), topicKey: signalTopicKey(slot, text), streakDays: 1, lastSentDay: null, autoSnoozedAt: null, ...over,
})

const run = (signals: MorningSignal[], history: BriefSignalHistory[], today: string) =>
  applyAutoSnooze(signals, history, today, muteRef)

describe('previousDay / daysBetweenKeys', () => {
  it('resta un día cruzando mes', () => {
    expect(previousDay('2026-08-01')).toBe('2026-07-31')
    expect(previousDay('2026-07-25')).toBe('2026-07-24')
  })
  it('cuenta días entre fechas', () => {
    expect(daysBetweenKeys('2026-07-25', '2026-08-08')).toBe(14)
    expect(daysBetweenKeys('2026-07-25', '2026-07-25')).toBe(0)
  })
  it('tolera basura', () => {
    expect(previousDay('nope')).toBe('')
    expect(Number.isNaN(daysBetweenKeys('x', '2026-07-25'))).toBe(true)
  })
})

describe('applyAutoSnooze — la racha', () => {
  it('primera vez: se muestra y arranca la racha', () => {
    const r = run([sig(MAMA)], [], '2026-07-25')
    expect(r.visible).toHaveLength(1)
    expect(r.updates[0]).toMatchObject({ streakDays: 1, lastSentDay: '2026-07-25', autoSnoozedAt: null })
  })

  it('segunda y tercera mañana seguidas: se sigue mostrando', () => {
    const dia2 = run([sig(MAMA)], [hist(MAMA, { streakDays: 1, lastSentDay: '2026-07-24' })], '2026-07-25')
    expect(dia2.visible).toHaveLength(1)
    expect(dia2.updates[0].streakDays).toBe(2)

    const dia3 = run([sig(MAMA)], [hist(MAMA, { streakDays: 2, lastSentDay: '2026-07-25' })], '2026-07-26')
    expect(dia3.visible).toHaveLength(1)
    expect(dia3.updates[0].streakDays).toBe(3)
  })

  it('CUARTA mañana seguida: se calla sola', () => {
    const r = run([sig(MAMA)], [hist(MAMA, { streakDays: 3, lastSentDay: '2026-07-26' })], '2026-07-27')
    expect(r.visible).toHaveLength(0)
    expect(r.silenced[0]).toMatchObject({ reason: 'racha' })
    expect(r.updates[0].autoSnoozedAt).toBe('2026-07-27')
  })

  it('un hueco rompe la racha: si faltó un día, vuelve a contar desde 1', () => {
    const r = run([sig(MAMA)], [hist(MAMA, { streakDays: 3, lastSentDay: '2026-07-20' })], '2026-07-25')
    expect(r.visible).toHaveLength(1)
    expect(r.updates[0].streakDays).toBe(1)
  })
})

describe('applyAutoSnooze — el sueño', () => {
  const dormida = (day: string) => [hist(MAMA, { streakDays: 4, lastSentDay: '2026-07-26', autoSnoozedAt: day })]

  it('mientras duerme no aparece', () => {
    expect(run([sig(MAMA)], dormida('2026-07-27'), '2026-07-28').visible).toHaveLength(0)
    expect(run([sig(MAMA)], dormida('2026-07-27'), '2026-08-05').silenced[0].reason).toBe('durmiendo')
  })

  it('a las 2 semanas despierta y arranca de cero', () => {
    const r = run([sig(MAMA)], dormida('2026-07-27'), '2026-08-10')
    expect(r.visible).toHaveLength(1)
    expect(r.updates[0]).toMatchObject({ streakDays: 1, autoSnoozedAt: null })
  })
})

describe('applyAutoSnooze — qué NO calla', () => {
  it('el tema que cambió de verdad es otra señal y aparece', () => {
    // Historial de "conflicto sin resolver"; hoy la señal es "tu mamá te escribió".
    const nueva = sig('Maria Isabel te escribió ayer después de 3 semanas')
    const r = run([nueva], [hist(MAMA, { streakDays: 3, lastSentDay: '2026-07-26', autoSnoozedAt: '2026-07-27' })], '2026-07-27')
    expect(r.visible).toHaveLength(1)
  })

  it('reformular el MISMO tema no reinicia la cuenta (el topicKey es estable)', () => {
    const tresSemanas = 'Hace 3 semanas sin hablar con Maria Isabel Espinoza Vidaurre — tu mamá'
    const cuatroSemanas = 'Hace 4 semanas sin hablar con Maria Isabel Espinoza Vidaurre — tu mamá'
    const r = run(
      [sig(cuatroSemanas, 'relationshipNudge')],
      [hist(tresSemanas, { streakDays: 3, lastSentDay: '2026-07-26' }, 'relationshipNudge')],
      '2026-07-27',
    )
    expect(r.visible).toHaveLength(0) // sigue siendo la misma señal → se calla
  })

  it('dos nudges sobre personas DISTINTAS no se pisan (el slot no aplasta el tema)', () => {
    const mama = sig('Hace 3 semanas sin hablar con Maria Isabel — tu mamá', 'relationshipNudge')
    const guillermo = sig('Hace 5 semanas sin hablar con Guillermo Castro', 'relationshipNudge')
    const r = run([mama, guillermo], [hist(mama.text, { streakDays: 3, lastSentDay: '2026-07-26' }, 'relationshipNudge')], '2026-07-27')
    expect(r.visible.map((s) => s.text)).toEqual([guillermo.text])
    expect(r.silenced.map((s) => s.text)).toEqual([mama.text])
  })

  it('cada señal lleva su propia cuenta', () => {
    const r = run(
      [sig(MAMA), sig(TAREA, 'dueTask')],
      [hist(MAMA, { streakDays: 3, lastSentDay: '2026-07-26' })],
      '2026-07-27',
    )
    expect(r.visible.map((s) => s.text)).toEqual([TAREA])
    expect(r.silenced.map((s) => s.text)).toEqual([MAMA])
  })

  it('sin señales no hace nada', () => {
    const r = run([], [hist(MAMA)], '2026-07-27')
    expect(r).toMatchObject({ visible: [], silenced: [], updates: [] })
  })
})

describe('applyAutoSnooze — señales agregadas (bug del 26-jul)', () => {
  // La señal del ciclo lista a quienes están en ventana; esa lista cambia todos
  // los días. Con la clave vieja (solo texto) su ref bailaba cada mañana, la
  // racha se reiniciaba sola y JAMÁS llegaba a 3: la señal más repetitiva del
  // brief era justo la única que no se podía callar.
  const dia1 = 'Semana afectiva cargada: coinciden Diana, Aeylin, Amira y Carolina en fase alta'
  const dia2 = 'Semana afectiva cargada: coinciden Diana, Dayana, Nicolle y Carolina en fase alta'
  const ciclo = (text: string) => ({ slot: 'cycleWeekAhead', section: 'gente' as const, text })

  it('el texto cambia pero la señal es la misma → la racha avanza', () => {
    expect(muteRef(dia1, 'cycleWeekAhead')).toBe(muteRef(dia2, 'cycleWeekAhead'))
    const r = run([ciclo(dia2)], [hist(dia1, { streakDays: 2, lastSentDay: '2026-07-25' }, 'cycleWeekAhead')], '2026-07-26')
    expect(r.updates[0].streakDays).toBe(3)
  })

  it('a la cuarta mañana se duerme, aunque nunca haya repetido el texto', () => {
    const r = run([ciclo(dia2)], [hist(dia1, { streakDays: 3, lastSentDay: '2026-07-25' }, 'cycleWeekAhead')], '2026-07-26')
    expect(r.visible).toHaveLength(0)
    expect(r.silenced[0].reason).toBe('racha')
  })
})

describe('applyAutoSnooze — idempotencia', () => {
  it('correr dos veces el mismo día no infla la racha ni duplica', () => {
    const h = [hist(MAMA, { streakDays: 2, lastSentDay: '2026-07-25' })]
    const primera = run([sig(MAMA)], h, '2026-07-25')
    expect(primera.visible).toHaveLength(1)
    expect(primera.updates[0].streakDays).toBe(2)
    const segunda = run([sig(MAMA)], primera.updates, '2026-07-25')
    expect(segunda.updates[0].streakDays).toBe(2)
  })
})
