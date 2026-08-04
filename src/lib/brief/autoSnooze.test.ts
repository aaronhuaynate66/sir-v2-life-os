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

// ═══════════════════════════════════════════════════════════════════════════
// EL FALLO REAL DEL 4-ago-2026, reproducido
//
// `slot:eventosProximos` se durmió el 3-ago por racha (streak 4). Con
// SNOOZE_DAYS=14 no despertaba hasta el 17-ago. Adentro de esa ventana muerta:
// la reunión en el Comando General del CGBVP (4-ago 11:00, el atajo al apoyo
// institucional para el Mundial), el examen del IPD del 7-ago con ayuno de 8 h,
// y el aniversario con Diana del 13-ago.
// ═══════════════════════════════════════════════════════════════════════════

describe('eventosProximos: identidad por conjunto + lo inminente no se calla', () => {
  const LINEA_VIEJA = '📅 Cirugía Maxilofacial — Dr. Campos Soto — mañana · PREPARAR el examen del IPD — el jueves · y 1 más esta semana.'
  const LINEA_NUEVA = '📅 Reunión en el Comando General (Delicia + Tte. Llatance) — hoy · PREPARAR el examen del IPD — el jueves · y 2 más esta semana.'

  const evSig = (text: string, identity: string, neverSnooze = false): MorningSignal => ({
    slot: 'eventosProximos', section: 'hoy', text,
    identity, ...(neverSnooze ? { neverSnooze: true } : {}),
  })

  /** La fila DORMIDA tal como estaba en prod el 4-ago. */
  const dormida = (s: MorningSignal): BriefSignalHistory => ({
    ref: muteRef(s.text, s.slot, s.identity),
    topicKey: signalTopicKey(s.slot, s.text, s.identity),
    streakDays: 4, lastSentDay: '2026-08-02', autoSnoozedAt: '2026-08-03',
  })

  it('el slot YA NO tiene clave fija: dos listas distintas no comparten identidad', () => {
    // El bug era exactamente esto al revés: con `slot:eventosProximos` (clave fija
    // por estar en AGGREGATE_SLOTS) estas dos refs eran IGUALES, así que la fila
    // dormida de la lista vieja silenciaba a la nueva por 14 días.
    const vieja: MorningSignal = { slot: 'eventosProximos', section: 'hoy', text: LINEA_VIEJA }
    const nueva: MorningSignal = { slot: 'eventosProximos', section: 'hoy', text: LINEA_NUEVA }
    expect(signalTopicKey(vieja.slot, vieja.text)).not.toBe('slot:eventosProximos')
    expect(muteRef(nueva.text, nueva.slot)).not.toBe(muteRef(vieja.text, vieja.slot))
  })

  it('sin identidad degrada a REPETIR, nunca a callarse 14 días (la decisión, fijada)', () => {
    // Si un caller olvidara pasar la identidad, el fallback es por contenido: el
    // texto cambia cada día que pasa ⇒ la racha se reinicia ⇒ repite más de lo
    // ideal pero NO desaparece. Elegido a propósito: repetir molesta, callarse le
    // costó una reunión.
    const ayer: MorningSignal = { slot: 'eventosProximos', section: 'hoy', text: '📅 Examen del IPD — mañana.' }
    const hoy: MorningSignal = { slot: 'eventosProximos', section: 'hoy', text: '📅 Examen del IPD — hoy.' }
    const h: BriefSignalHistory = {
      ref: muteRef(ayer.text, ayer.slot),
      topicKey: signalTopicKey(ayer.slot, ayer.text),
      streakDays: 3, lastSentDay: '2026-08-03', autoSnoozedAt: null,
    }
    const r = run([hoy], [h], '2026-08-04')
    expect(r.visible).toHaveLength(1)
    expect(r.updates[0].streakDays).toBe(1)
  })

  it('AHORA la identidad separa las dos listas → la reunión del Comando General SALE', () => {
    const vieja = evSig(LINEA_VIEJA, '2026-08-03~cirugia-maxilofacial|2026-08-06~preparar-examen+1')
    const nueva = evSig(LINEA_NUEVA, '2026-08-04~reunion-comando-general|2026-08-06~preparar-examen+2')
    expect(muteRef(nueva.text, nueva.slot, nueva.identity))
      .not.toBe(muteRef(vieja.text, vieja.slot, vieja.identity))
    const r = run([nueva], [dormida(vieja)], '2026-08-04')
    expect(r.visible.map((s) => s.text)).toEqual([LINEA_NUEVA])
    expect(r.silenced).toHaveLength(0)
    // Racha desde 1: es una señal nueva, no la continuación de la vieja.
    expect(r.updates[0].streakDays).toBe(1)
  })

  it('la MISMA lista un día después sigue contando racha y SÍ se duerme (el anti-repetición no se rompió)', () => {
    const mismaIdentidad = '2026-08-06~preparar-examen|2026-08-07~examen-ipd+0'
    const ayer = evSig('📅 … — mañana · … — el jueves.', mismaIdentidad)
    const hoy = evSig('📅 … — hoy · … — el miércoles.', mismaIdentidad)
    // Misma identidad ⇒ misma ref, aunque el texto haya cambiado de palabras.
    expect(muteRef(hoy.text, hoy.slot, hoy.identity)).toBe(muteRef(ayer.text, ayer.slot, ayer.identity))
    const h: BriefSignalHistory = {
      ref: muteRef(ayer.text, ayer.slot, ayer.identity),
      topicKey: signalTopicKey(ayer.slot, ayer.text, ayer.identity),
      streakDays: 3, lastSentDay: '2026-08-03', autoSnoozedAt: null,
    }
    const r = run([hoy], [h], '2026-08-04')
    expect(r.visible).toHaveLength(0)
    expect(r.silenced[0].reason).toBe('racha')
  })

  it('LO INMINENTE NO SE CALLA: un evento de hoy pasa incluso sobre una fila dormida', () => {
    // La segunda defensa. Aunque la identidad coincidiera con algo dormido, un
    // compromiso de hoy/mañana tiene que salir.
    const s = evSig(LINEA_NUEVA, 'misma-identidad+0', true)
    const r = run([s], [dormida(s)], '2026-08-04')
    expect(r.visible.map((x) => x.text)).toEqual([LINEA_NUEVA])
    expect(r.silenced).toHaveLength(0)
  })

  it('lo inminente tampoco se duerme por racha, y DESPIERTA la fila (no queda tapada mañana)', () => {
    const s = evSig(LINEA_NUEVA, 'examen-ipd+0', true)
    const h: BriefSignalHistory = {
      ref: muteRef(s.text, s.slot, s.identity),
      topicKey: signalTopicKey(s.slot, s.text, s.identity),
      streakDays: 9, lastSentDay: '2026-08-03', autoSnoozedAt: '2026-08-01',
    }
    const r = run([s], [h], '2026-08-04')
    expect(r.visible).toHaveLength(1)
    expect(r.silenced).toHaveLength(0)
    expect(r.updates[0].autoSnoozedAt).toBeNull()
    // La racha se sigue contando de verdad: la telemetría no debe mentir sobre
    // cuántas mañanas seguidas se dijo.
    expect(r.updates[0].streakDays).toBe(10)
  })

  it('re-corrida del mismo día no infla la racha de una señal inminente', () => {
    const s = evSig(LINEA_NUEVA, 'examen-ipd+0', true)
    const h: BriefSignalHistory = {
      ref: muteRef(s.text, s.slot, s.identity),
      topicKey: signalTopicKey(s.slot, s.text, s.identity),
      streakDays: 2, lastSentDay: '2026-08-04', autoSnoozedAt: null,
    }
    const r = run([s], [h], '2026-08-04')
    expect(r.visible).toHaveLength(1)
    expect(r.updates[0].streakDays).toBe(2)
  })

  it('los demás slots agregados NO cambiaron de identidad (sin identidad siguen por slot)', () => {
    const ciclo: MorningSignal = { slot: 'cycleWeekAhead', section: 'gente', text: 'Coinciden Diana y Aeylin' }
    const otro: MorningSignal = { slot: 'cycleWeekAhead', section: 'gente', text: 'Coinciden Nicolle y Miluska' }
    expect(signalTopicKey(ciclo.slot, ciclo.text)).toBe('slot:cycleWeekAhead')
    expect(muteRef(otro.text, otro.slot)).toBe(muteRef(ciclo.text, ciclo.slot))
  })
})
