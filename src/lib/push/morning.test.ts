import { describe, it, expect } from 'vitest'
import { buildMorningPush, dedupeSignals, topicOverlap, topicKey } from './morning'

// Textos REALES del brief que Aaron recibió el 25-jul-2026.
const BOTICAS_CORTO = 'Cerrar Boticas Jhodaal como cliente de Marlab · EN 6 DÍAS'
const BOTICAS_LARGO = '"Cerrar Boticas Jhodaal como cliente de Marlab" vence en 6 días y vas 0% — conviene un empujón'
const MAMA_SILENCIO = 'Hace 3 semanas sin hablar con Maria Isabel Espinoza Vidaurre — tu mamá'
const MAMA_CONFLICTO = 'Con Maria Isabel Espinoza Vidaurre: "Conflicto por el Mundial de Bomberos" ya parece resuelto — ¿lo cierras?'

describe('dedupe de temas repetidos', () => {
  it('reconoce como el MISMO tema las dos formas de decir lo de Boticas', () => {
    expect(topicOverlap(BOTICAS_CORTO, BOTICAS_LARGO)).toBeGreaterThanOrEqual(0.8)
  })

  it('NO confunde dos señales distintas sobre la misma persona', () => {
    expect(topicOverlap(MAMA_SILENCIO, MAMA_CONFLICTO)).toBeLessThan(0.8)
  })

  it('deja una sola señal de Boticas, con el texto más informativo', () => {
    const out = dedupeSignals([
      { slot: 'weekFocus', section: 'metas', text: BOTICAS_CORTO },
      { slot: 'goalNudge', section: 'metas', text: BOTICAS_LARGO },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].text).toBe(BOTICAS_LARGO)
    expect(out[0].slot).toBe('weekFocus') // conserva la posición/prioridad de la primera
  })

  it('deduplicar NO mata el botón: la señal que se queda hereda la entidad', () => {
    // Caso real: weekFocus (sin id en el turno) le ganaba a goalNudge (con id) y
    // el mensaje de metas se quedaba sin "🚀 Dame el próximo paso".
    const out = dedupeSignals([
      { slot: 'weekFocus', section: 'metas', text: BOTICAS_CORTO },
      { slot: 'goalNudge', section: 'metas', text: BOTICAS_LARGO, entity: { kind: 'goal', id: 'g_1', name: 'Boticas' } },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].entity).toEqual({ kind: 'goal', id: 'g_1', name: 'Boticas' })
  })

  it('la entidad de la primera manda si ambas la tienen', () => {
    const out = dedupeSignals([
      { slot: 'weekFocus', section: 'metas', text: BOTICAS_CORTO, entity: { kind: 'goal', id: 'primero' } },
      { slot: 'goalNudge', section: 'metas', text: BOTICAS_LARGO, entity: { kind: 'goal', id: 'segundo' } },
    ])
    expect(out[0].entity?.id).toBe('primero')
  })

  it('el brief real de Aaron pierde el duplicado pero conserva las dos de su mamá', () => {
    const p = buildMorningPush({
      weekFocus: BOTICAS_CORTO,
      goalNudge: BOTICAS_LARGO,
      relationshipNudge: MAMA_SILENCIO,
      momentResolution: MAMA_CONFLICTO,
      dueTasks: ['Hacer UAT con Dayana: revisar flujo completo de compra y admin'],
    })
    expect(p.signals.filter((s) => s.text.includes('Boticas'))).toHaveLength(1)
    expect(p.signals.filter((s) => s.text.includes('Maria Isabel'))).toHaveLength(2)
  })
})

describe('🔕 señales silenciadas', () => {
  it('un tema silenciado no vuelve a aparecer', () => {
    const conMute = buildMorningPush({
      relationshipNudge: MAMA_SILENCIO,
      momentResolution: MAMA_CONFLICTO,
      mutedTopics: [topicKey(MAMA_CONFLICTO)],
    })
    expect(conMute.signals.map((s) => s.text)).toEqual([MAMA_SILENCIO])
  })

  it('el silencio sobrevive a que el texto se reformule (el número cambia)', () => {
    const enUnMes = 'Hace 7 semanas sin hablar con Maria Isabel Espinoza Vidaurre — tu mamá'
    const p = buildMorningPush({ relationshipNudge: enUnMes, mutedTopics: [topicKey(MAMA_SILENCIO)] })
    expect(p.signals).toHaveLength(0)
  })

  it('silenciar no le roba el cupo a otra señal', () => {
    const otras = Array.from({ length: 8 }, (_, i) => `Cumple de persona ${i}`)
    const p = buildMorningPush({
      relationshipNudge: MAMA_CONFLICTO,
      importantDates: otras.slice(0, 2),
      birthdays: [{ name: 'Ana', days: 1 }],
      dueTasks: ['Cerrar reporte'],
      mutedTopics: [topicKey(MAMA_CONFLICTO)],
    })
    expect(p.signals.some((s) => s.text === MAMA_CONFLICTO)).toBe(false)
    expect(p.signals.length).toBeGreaterThan(0)
  })

  it('sin silenciados, todo pasa igual', () => {
    const p = buildMorningPush({ relationshipNudge: MAMA_SILENCIO, mutedTopics: [] })
    expect(p.signals).toHaveLength(1)
  })
})

describe('entidades que habilitan los botones', () => {
  it('la señal lleva el id de la tarea cuando hay UNA sola', () => {
    const p = buildMorningPush({
      dueTasks: ['UAT con Dayana'],
      entities: { dueTask: { id: 'step_1', name: 'UAT con Dayana' } },
    })
    expect(p.signals.find((s) => s.slot === 'dueTask')?.entity).toEqual({ kind: 'task', id: 'step_1', name: 'UAT con Dayana' })
  })

  it('sin entidad, la señal existe igual (solo que sin acción)', () => {
    const p = buildMorningPush({ dueTasks: ['UAT con Dayana'] })
    expect(p.signals.find((s) => s.slot === 'dueTask')?.entity).toBeUndefined()
  })

  it('persona, momento y objetivo viajan con su tipo', () => {
    const p = buildMorningPush({
      relationshipNudge: 'Hace 3 semanas sin hablar con tu mamá',
      momentResolution: 'El conflicto parece resuelto',
      goalNudge: 'Boticas Jhodaal vence en 6 días',
      entities: {
        relationshipPerson: { id: 'per_1', name: 'Maria' },
        moment: { id: 'mom_1' },
        goalNudgeGoal: { id: 'g_1' },
      },
    })
    expect(p.signals.find((s) => s.slot === 'relationshipNudge')?.entity?.kind).toBe('person')
    expect(p.signals.find((s) => s.slot === 'momentResolution')?.entity?.kind).toBe('moment')
    expect(p.signals.find((s) => s.slot === 'goalNudge')?.entity?.kind).toBe('goal')
  })
})

describe('señales tipadas por sección', () => {
  it('cada señal sabe de qué slot viene y a qué sección va', () => {
    const p = buildMorningPush({
      dueTasks: ['Cerrar reporte'],
      relationshipNudge: 'Hace 3 semanas sin hablar con tu mamá',
      goalNudge: 'Boticas Jhodaal vence en 6 días',
    })
    expect(p.signals.find((s) => s.slot === 'dueTask')?.section).toBe('hoy')
    expect(p.signals.find((s) => s.slot === 'relationshipNudge')?.section).toBe('gente')
    expect(p.signals.find((s) => s.slot === 'goalNudge')?.section).toBe('metas')
  })

  it('bodyFull sigue siendo las mismas señales pegadas (compat del push web)', () => {
    const p = buildMorningPush({ dueTasks: ['Cerrar reporte'], focus: 'Mundial' })
    expect(p.bodyFull).toBe(p.signals.map((s) => s.text).join(' · '))
  })

  it('sin señales, signals queda vacío', () => {
    expect(buildMorningPush({}).signals).toEqual([])
  })
})

describe('buildMorningPush', () => {
  it('mensaje amable si no hay nada', () => {
    const p = buildMorningPush({})
    expect(p.title).toBe('Buenos días')
    expect(p.body).toContain('nada urgente')
  })
  it('prioriza gente/fechas y dice corto', () => {
    const p = buildMorningPush({ birthdays: [{ name: 'Francisco', days: 3 }], dueTasks: ['Cerrar reporte'] })
    expect(p.body).toContain('Francisco cumple en 3 días')
    expect(p.body).toContain('Hoy vence: Cerrar reporte')
  })
  it('hoy / mañana', () => {
    expect(buildMorningPush({ birthdays: [{ name: 'A', days: 0 }] }).body).toContain('A cumple hoy')
    expect(buildMorningPush({ birthdays: [{ name: 'B', days: 1 }] }).body).toContain('B cumple mañana')
  })
  it('cap a 3 partes (no vuelca)', () => {
    const p = buildMorningPush({
      birthdays: [{ name: 'A', days: 1 }, { name: 'B', days: 2 }],
      dueTasks: ['T1', 'T2'],
      focus: 'Foco X',
      topSignal: 'Señal Y',
    })
    expect(p.body.split(' · ').length).toBe(3)
    expect(p.body).not.toContain('Señal Y') // quedó fuera del cap
  })
  it('varias tareas se cuentan', () => {
    const p = buildMorningPush({ dueTasks: ['T1', 'T2', 'T3'] })
    expect(p.body).toContain('3 tareas para hoy (T1…)')
  })
})

describe('buildMorningPush — prioridad máxima (semana en foco / métrica dura)', () => {
  it('weekFocus va al frente, antes que un cumpleaños', () => {
    const p = buildMorningPush({ weekFocus: 'Mudanza en 3 días', birthdays: [{ name: 'A', days: 2 }] })
    const parts = p.body.split(' · ')
    expect(parts[0]).toContain('Mudanza en 3 días')
    expect(p.body).toContain('A cumple')
  })
  it('metricAlert va antes que un cumpleaños', () => {
    const p = buildMorningPush({ metricAlert: 'Peso 3kg sobre categoría Mundial', birthdays: [{ name: 'A', days: 2 }] })
    const parts = p.body.split(' · ')
    expect(parts[0]).toContain('Peso 3kg sobre categoría Mundial')
  })
  it('weekFocus + metricAlert toman los 2 primeros slots; la tarea queda fuera del cap', () => {
    const p = buildMorningPush({
      weekFocus: 'Mudanza en 3 días',
      metricAlert: 'Peso sobre categoría',
      birthdays: [{ name: 'A', days: 1 }],
      dueTasks: ['T1'],
    })
    const parts = p.body.split(' · ')
    expect(parts.length).toBe(3)
    expect(parts[0]).toContain('Mudanza')
    expect(parts[1]).toContain('Peso sobre categoría')
    expect(parts[2]).toContain('A cumple') // el cumple entra en el 3er slot
    expect(p.body).not.toContain('T1') // la tarea quedó fuera del cap
  })
  it('bodyFull no trunca aunque body sí (Telegram recibe el completo)', () => {
    const largo = 'X'.repeat(400)
    const p = buildMorningPush({ weekFocus: largo })
    expect(p.body.length).toBeLessThanOrEqual(220)
    expect(p.bodyFull).toContain(largo)
  })
})

describe('buildMorningPush — buen momento × objetivo', () => {
  it('incluye el goalContactTiming cuando viene', () => {
    const p = buildMorningPush({ goalContactTiming: '⏳ Buen momento con Dayana: anda activa hoy. Tienes pendiente «pedirle el contacto» (Marlab).' })
    expect(p.body).toContain('Buen momento con Dayana')
  })
  it('va antes que las tareas (junto a lo relacional)', () => {
    const p = buildMorningPush({
      goalContactTiming: '⏳ Buen momento con Dayana: anda activa hoy.',
      dueTasks: ['Cerrar reporte'],
    })
    const parts = p.body.split(' · ')
    expect(parts[0]).toContain('Buen momento con Dayana')
    expect(parts.some((x) => x.includes('Cerrar reporte'))).toBe(true)
  })
})

describe('buildMorningPush — hábito a retomar', () => {
  it('incluye el nudge de hábito cuando viene', () => {
    const p = buildMorningPush({ habitNudge: 'Se cortó tu racha de "Meditar". Retomala hoy.' })
    expect(p.body).toContain('Se cortó tu racha de "Meditar"')
  })
  it('respeta el cap de 3 partes con hábito', () => {
    const p = buildMorningPush({
      birthdays: [{ name: 'A', days: 1 }],
      dueTasks: ['T1'],
      habitNudge: 'Racha rota X',
      focus: 'Foco',
    })
    expect(p.body.split(' · ').length).toBe(3)
    expect(p.body).not.toContain('Foco') // quedó fuera del cap (hábito entró antes)
  })
})

describe('buildMorningPush — a quién cuidar hoy (nudge relacional)', () => {
  it('incluye el nudge relacional cuando viene', () => {
    const p = buildMorningPush({ relationshipNudge: 'Diana (tu pareja) — Sin hablar hace 12 días' })
    expect(p.body).toContain('Diana (tu pareja)')
    expect(p.body).toContain('Sin hablar hace 12 días')
  })
  it('el nudge relacional va ANTES que los cumpleaños (prioridad 2026-07-23) y antes de tareas', () => {
    const p = buildMorningPush({
      birthdays: [{ name: 'Pedro', days: 2 }],
      relationshipNudge: 'Sasa — Relación dormida',
      dueTasks: ['Cerrar reporte'],
    })
    // Subir "a quién cuidar" sobre los cumpleaños: un cumple en N días no debe
    // tapar el cuidado de un vínculo que se enfría hoy.
    expect(p.body.indexOf('Sasa')).toBeLessThan(p.body.indexOf('Pedro'))
    expect(p.body.indexOf('Pedro')).toBeLessThan(p.body.indexOf('Cerrar reporte'))
  })
  it('pero un aniversario del día (importantDates) sigue sobre el nudge relacional', () => {
    const p = buildMorningPush({
      importantDates: ['Aniversario con Diana · ¡Hoy!'],
      relationshipNudge: 'Sasa — Relación dormida',
    })
    expect(p.body.indexOf('Aniversario con Diana')).toBeLessThan(p.body.indexOf('Sasa'))
  })
})

describe('buildMorningPush — cerrar un lazo (cruce chat→tema)', () => {
  it('incluye la sugerencia de cerrar un tema resuelto', () => {
    const p = buildMorningPush({ momentResolution: 'Con Diana: "Examen del seguro" ya parece resuelto — ¿lo cierras?' })
    expect(p.body).toContain('Examen del seguro')
    expect(p.body).toContain('¿lo cierras?')
  })
  it('va junto a lo relacional: después del nudge, antes de las tareas', () => {
    const p = buildMorningPush({
      relationshipNudge: 'Sasa — Relación dormida',
      momentResolution: 'Con Diana: "Examen" ya parece resuelto — ¿lo cierras?',
      dueTasks: ['Cerrar reporte'],
    })
    expect(p.body.indexOf('Sasa')).toBeLessThan(p.body.indexOf('Examen'))
    expect(p.body.indexOf('Examen')).toBeLessThan(p.body.indexOf('Cerrar reporte'))
  })
})

describe('buildMorningPush — vigilancia de laboratorio', () => {
  it('incluye el healthWatch cuando viene', () => {
    const p = buildMorningPush({ healthWatch: 'Chequeo · Glucosa viene subiendo 3 exámenes seguidos y salió de rango — conviene revisarlo' })
    expect(p.body).toContain('Glucosa')
    expect(p.body).toContain('revisarlo')
  })
  it('va bajo: cede el paso a las señales agudas (cap de 3)', () => {
    const p = buildMorningPush({
      birthdays: [{ name: 'A', days: 1 }],
      relationshipNudge: 'Diana dormida',
      dueTasks: ['T1'],
      healthWatch: 'Chequeo Glucosa fuera de rango',
    })
    expect(p.body.split(' · ').length).toBe(3)
    expect(p.body).not.toContain('Glucosa') // quedó fuera del cap (lo agudo entró antes)
  })
})

describe('buildMorningPush — body (push, capado) vs bodyFull (chat, completo)', () => {
  it('el mensaje amable expone bodyFull igual al body', () => {
    const p = buildMorningPush({})
    expect(p.bodyFull).toBe(p.body)
  })
  it('cuando cabe, body y bodyFull son idénticos', () => {
    const p = buildMorningPush({ birthdays: [{ name: 'Ana', days: 2 }] })
    expect(p.body).toBe(p.bodyFull)
    expect(p.body).not.toContain('…')
  })
  it('Telegram (bodyFull) muestra MÁS señales que el push del navegador (body, top 3)', () => {
    // Decisión 2026-07-23: el navegador queda calmo en 3, pero el chat (4096
    // chars) aprovecha más de las señales que igual ya se computaron.
    const p = buildMorningPush({
      weekFocus: 'Mudanza en 2 días',
      metricAlert: 'Peso alto',
      relationshipNudge: 'Cuidar a Diana',
      momentResolution: 'Cerrar tema con X',
      dueTasks: ['Tarea 1'],
      habitNudge: 'Racha rota',
      bodySignal: 'Deuda de sueño',
    })
    expect(p.body.split(' · ').length).toBe(3)
    expect(p.bodyFull.split(' · ').length).toBeGreaterThan(3)
    expect(p.bodyFull).toContain('Deuda de sueño') // señal que el push del navegador omite
    expect(p.body).not.toContain('Deuda de sueño')
  })
  it('cuando excede 220, body se corta con … pero bodyFull queda ENTERO', () => {
    // Reproduce el bug real de Aaron: nudge relacional largo + tema resuelto +
    // tarea → el body capado partía "Hoy vence:" a la mitad.
    const p = buildMorningPush({
      relationshipNudge: 'Hace 3 semanas sin hablar con Maria Fernanda Brañez — tu media hermana',
      momentResolution: 'Con Maria Isabel Espinoza Vidaurre: "Conflicto por el Mundial de Bomberos" ya parece resuelto — ¿lo cierras?',
      dueTasks: ['Pedir las pastillas para la cabeza'],
    })
    // El push (navegador) sí se capa.
    expect(p.body.length).toBeLessThanOrEqual(220)
    expect(p.body.endsWith('…')).toBe(true)
    // El brief (Telegram) NO: la tarea que vence se lee completa, sin "…" colgado.
    expect(p.bodyFull.length).toBeGreaterThan(220)
    expect(p.bodyFull).toContain('Hoy vence: Pedir las pastillas para la cabeza')
    expect(p.bodyFull.endsWith('…')).toBe(false)
  })
})

describe('buildMorningPush — nudge de objetivo', () => {
  it('incluye el goalNudge y suprime el foco genérico (no 2 líneas de meta)', () => {
    const p = buildMorningPush({ goalNudge: 'Tu norte ("X") lleva 20 días sin moverse — dale un paso hoy', focus: 'X' })
    expect(p.body).toContain('20 días sin moverse')
    expect(p.body).not.toContain('Foco:') // el foco genérico se omite
  })
  it('sin goalNudge, el foco genérico sigue apareciendo', () => {
    const p = buildMorningPush({ focus: 'Cerrar el trato' })
    expect(p.body).toContain('Foco: Cerrar el trato')
  })
})

describe('buildMorningPush — fechas especiales / aniversarios', () => {
  it('incluye el aniversario mensual (mesario) en el brief', () => {
    const p = buildMorningPush({ importantDates: ['Aniversario mensual relación (13) · ¡Hoy!'] })
    expect(p.body).toContain('Aniversario mensual')
    expect(p.body).toContain('¡Hoy!')
  })
  it('las fechas especiales van ANTES que los cumpleaños', () => {
    const p = buildMorningPush({
      importantDates: ['Aniversario con Diana · ¡Hoy!'],
      birthdays: [{ name: 'Pedro', days: 4 }],
    })
    expect(p.body.indexOf('Aniversario con Diana')).toBeLessThan(p.body.indexOf('Pedro'))
  })
})

describe('💬 desplome de afecto en el brief', () => {
  // Aaron, 31-jul-2026: "por qué no tengo ninguna alerta de cómo viene mi relación
  // con Diana si mis últimas conversaciones tan hasta las webas". El IAE medía desde
  // el 23-jul y nada llegaba al brief. Estos tests fijan que ahora llega.
  const CAIDA = '💬 el balance del chat con Diana se dio vuelta estos 3 días (de 6 a 0.8 positivo por negativo). Es lo que se ESCRIBE, no lo que se siente — ¿todo bien o solo andan ocupados?'

  it('la línea llega al push, en la sección de gente', () => {
    const p = buildMorningPush({ afectoCaida: CAIDA })
    const s = p.signals.find((x) => x.slot === 'afectoCaida')
    expect(s).toBeDefined()
    expect(s!.section).toBe('gente')
    expect(s!.text).toBe(CAIDA)
  })

  it('va ANTES de "a quién cuidar hoy": ese slot mide descuido y con Diana hablaba 250 msgs/día', () => {
    const p = buildMorningPush({ afectoCaida: CAIDA, relationshipNudge: 'Escríbele a Leo, hace 20 días' })
    const slots = p.signals.map((s) => s.slot)
    expect(slots.indexOf('afectoCaida')).toBeLessThan(slots.indexOf('relationshipNudge'))
  })

  it('se puede silenciar como cualquier otra señal', () => {
    const p = buildMorningPush({ afectoCaida: CAIDA, mutedTopics: [topicKey(CAIDA)] })
    expect(p.signals.some((s) => s.slot === 'afectoCaida')).toBe(false)
  })

  it('sin caída no agrega nada', () => {
    expect(buildMorningPush({}).signals.some((s) => s.slot === 'afectoCaida')).toBe(false)
  })
})

describe('🩺 examen reciente en el brief', () => {
  const LINEA = '🩺 Tu "TEM de emergencia — encéfalo + macizo facial" de hace 4 días tiene 11 recomendaciones (pregúntame por las otras 10). La primera: descartar hematoma septal'

  it('llega al push, en la sección de hoy', () => {
    const p = buildMorningPush({ examenReciente: LINEA })
    const s = p.signals.find((x) => x.slot === 'examenReciente')
    expect(s).toBeDefined()
    expect(s!.section).toBe('hoy')
  })

  it('va ANTES de healthWatch: sus recomendaciones pueden tener ventana de días', () => {
    const p = buildMorningPush({
      examenReciente: LINEA,
      healthWatch: 'Chequeo · Hematocrito viene bajando 3 exámenes seguidos',
    })
    const slots = p.signals.map((s) => s.slot)
    expect(slots.indexOf('examenReciente')).toBeLessThan(slots.indexOf('healthWatch'))
  })

  it('sin examen reciente no agrega nada', () => {
    expect(buildMorningPush({}).signals.some((s) => s.slot === 'examenReciente')).toBe(false)
  })
})
