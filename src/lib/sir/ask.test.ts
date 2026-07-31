import { describe, it, expect } from 'vitest'
import { buildAskContext, extractCandidateNames, buildReceipts } from './ask'

describe('extractCandidateNames', () => {
  const known = ['Dayana Yrribarren Terrones', 'Francisco Pérez', 'Adrian Prochazca', 'Victor Rodriguez']
  it('matchea por primer nombre, insensible a tildes/mayúsculas', () => {
    expect(extractCandidateNames('¿qué pasó con dayana?', known)).toEqual(['Dayana Yrribarren Terrones'])
    expect(extractCandidateNames('cómo me acerco a FRANCISCO esta semana', known)).toEqual(['Francisco Pérez'])
  })
  it('no matchea si no se menciona a nadie conocido', () => {
    expect(extractCandidateNames('cómo va todo', known)).toEqual([])
  })
  it('matchea varios y acota', () => {
    const r = extractCandidateNames('victor y adrian', known)
    expect(r.sort()).toEqual(['Adrian Prochazca', 'Victor Rodriguez'])
  })
  it('evita falsos positivos por substring corto', () => {
    // "vic" no debería disparar Victor; pedimos palabra completa del primer nombre
    expect(extractCandidateNames('necesito una victoria', known)).toEqual([])
  })
})

describe('buildAskContext', () => {
  it('arma personas, memorias, objetivos y pregunta', () => {
    const ctx = buildAskContext({
      question: '¿cómo me acerco a Francisco?',
      todayISO: '2026-06-14',
      people: [{ name: 'Francisco', relationship: 'amigo', lastContact: '2026-05-01T00:00:00Z', scoreGlobal: 55, fuerza: 60, reciprocidad: null, confianza: 50, recentMemories: ['Hablaron del Mundial'], activeGoal: 'Mejorar mi relación con Francisco' }],
      memories: [{ content: 'Se ofreció a ayudarte', personName: 'Francisco', occurredAt: '2026-05-01' }],
      goals: [{ title: 'Mejorar mi relación con Francisco', nextAction: 'Invitarlo a entrenar' }],
    })
    expect(ctx).toContain('== PERSONAS ==')
    expect(ctx).toContain('Francisco')
    expect(ctx).toContain('global 55')
    expect(ctx).toContain('objetivo ligado: Mejorar mi relación con Francisco')
    expect(ctx).toContain('== OBJETIVOS ACTIVOS ==')
    expect(ctx).toContain('== PREGUNTA ==')
  })
  it('destaca el ancla como TU NORTE, aparte de los demás objetivos', () => {
    const ctx = buildAskContext({
      question: 'x', todayISO: '2026-06-14', people: [], memories: [],
      goals: [
        { title: 'Ganar el Mundial WFG26', nextAction: 'Cerrar 3 ventas', isAnchor: true },
        { title: 'Mejorar mi relación con Francisco' },
      ],
    })
    expect(ctx).toContain('== TU NORTE (el ancla del año) ==')
    expect(ctx).toContain('Ganar el Mundial WFG26')
    // El ancla no se repite en la lista de activos.
    const activos = ctx.slice(ctx.indexOf('== OBJETIVOS ACTIVOS =='))
    expect(activos).not.toContain('Ganar el Mundial WFG26')
    expect(activos).toContain('Mejorar mi relación con Francisco')
  })
  it('avisa cuando no hay data', () => {
    const ctx = buildAskContext({ question: 'x', todayISO: '2026-06-14', people: [], memories: [], goals: [] })
    expect(ctx).toContain('No se encontró data')
  })
  it('incluye la fase del ciclo con encuadre de cuidado (no determinista)', () => {
    const ctx = buildAskContext({
      question: '¿en qué fase está Diana?',
      todayISO: '2026-07-12',
      people: [{
        name: 'Diana', relationship: 'pareja', recentMemories: [],
        cycle: { label: 'Lútea', cycleDay: 20, cycleLength: 28, daysUntilNextPeriod: 9, isPmsWindow: false, isFertileWindow: false, note: 'Fase lútea. Energía decreciente.' },
      }],
      memories: [], goals: [],
    })
    expect(ctx).toContain('fase actual: Lútea (día 20/28)')
    expect(ctx).toContain('~9 día(s) para el próximo período')
    expect(ctx).toContain('NUNCA para descalificar') // el encuadre ético viaja con el dato
  })
  it('marca la ventana premenstrual cuando aplica', () => {
    const ctx = buildAskContext({
      question: 'x', todayISO: '2026-07-12',
      people: [{
        name: 'Diana', recentMemories: [],
        cycle: { label: 'Lútea', cycleDay: 26, cycleLength: 28, daysUntilNextPeriod: 3, isPmsWindow: true, isFertileWindow: false, note: 'Fase lútea.' },
      }],
      memories: [], goals: [],
    })
    expect(ctx).toContain('ventana premenstrual')
    expect(ctx).toContain('presencia y suavidad')
  })
  it('no renderiza ciclo si la persona no lo tiene', () => {
    const ctx = buildAskContext({
      question: 'x', todayISO: '2026-07-12',
      people: [{ name: 'Francisco', recentMemories: [] }],
      memories: [], goals: [],
    })
    expect(ctx).not.toContain('ciclo menstrual')
  })
})

import {
  SIR_ASK_SYSTEM_PROMPT,
  isHealthQuery, isReminderQuery, isDealQuery, isTensionQuery, isExamQuery, renderExamsBlock,
  isCircleCycleQuery, isAffectionClimateQuery, isAgendaQuery,
  selectRecentHealth, renderHealthBlock,
  renderRemindersBlock, renderDealsBlock, renderTensionAlertsBlock,
  renderCircleCycleBlock, renderAffectionClimateBlock, renderAgendaBlock,
} from './ask'

describe('capability map en el prompt', () => {
  it('lista las integraciones y prohíbe negarlas', () => {
    expect(SIR_ASK_SYSTEM_PROMPT).toContain('INTEGRACIONES Y FUENTES QUE EXISTEN EN SIR')
    expect(SIR_ASK_SYSTEM_PROMPT).toContain('Reader social')
    expect(SIR_ASK_SYSTEM_PROMPT).toContain('Deals / oportunidades')
    expect(SIR_ASK_SYSTEM_PROMPT).toContain('Recordatorios')
    // La regla dura distingue "no existe la integración" de "no me lo pasaron este turno".
    expect(SIR_ASK_SYSTEM_PROMPT).toContain('JAMÁS lo digas de ninguna fuente listada')
  })
})

describe('detección de intención (gating de bloques)', () => {
  it('salud/sueño/peso/FC', () => {
    expect(isHealthQuery('¿cómo dormí anoche?')).toBe(true)
    expect(isHealthQuery('cuánto peso tengo')).toBe(true)
    expect(isHealthQuery('mi VFC de hoy')).toBe(true)
    expect(isHealthQuery('¿qué oportunidades tengo?')).toBe(false)
  })
  it('recordatorios/pendientes', () => {
    expect(isReminderQuery('¿qué recordatorios tengo pendientes?')).toBe(true)
    expect(isReminderQuery('recuérdame llamar al banco')).toBe(true)
    expect(isReminderQuery('cómo está Diana')).toBe(false)
  })
  it('deals/oportunidades/pipeline', () => {
    expect(isDealQuery('¿qué oportunidades abiertas tengo?')).toBe(true)
    expect(isDealQuery('cómo va el pipeline')).toBe(true)
    expect(isDealQuery('mi cliente Sienna')).toBe(true)
    expect(isDealQuery('¿cómo dormí?')).toBe(false)
  })
  it('tensión relacional', () => {
    expect(isTensionQuery('¿con quién estoy distante?')).toBe(true)
    expect(isTensionQuery('alguna relación tensa')).toBe(true)
    expect(isTensionQuery('cuánto peso')).toBe(false)
  })
  it('semana / ciclo del círculo', () => {
    expect(isCircleCycleQuery('¿Cómo viene la semana con las mujeres de mi círculo?')).toBe(true)
    expect(isCircleCycleQuery('¿quién está sensible esta semana?')).toBe(true)
    expect(isCircleCycleQuery('¿cómo viene el ciclo del círculo?')).toBe(true)
    expect(isCircleCycleQuery('¿cuánto peso tengo?')).toBe(false)
  })
  it('clima afectivo / cariño (IAE)', () => {
    expect(isAffectionClimateQuery('¿Cómo viene el clima afectivo con Diana?')).toBe(true)
    expect(isAffectionClimateQuery('¿estamos más secos o cariñosos?')).toBe(true)
    expect(isAffectionClimateQuery('¿cómo venimos con Diana?')).toBe(true)
    expect(isAffectionClimateQuery('¿qué oportunidades tengo?')).toBe(false)
  })
  it('agenda / eventos próximos', () => {
    expect(isAgendaQuery('¿Qué tengo agendado los próximos días?')).toBe(true)
    expect(isAgendaQuery('¿qué hay el sábado?')).toBe(true)
    expect(isAgendaQuery('mi calendario de la semana')).toBe(true)
    expect(isAgendaQuery('cómo dormí anoche')).toBe(false)
  })
})

describe('renderCircleCycleBlock', () => {
  it('envuelve la línea de cuidado con encabezado de tendencia', () => {
    const b = renderCircleCycleBlock('Semana con carga afectiva: coinciden Amira y Aeylin en una ventana sensible del ciclo.')
    expect(b).toContain('== SEMANA / CICLO DEL CÍRCULO')
    expect(b).toContain('tendencia, NO veredicto')
    expect(b).toContain('coinciden Amira y Aeylin')
  })
  it('vacío si no hay línea', () => {
    expect(renderCircleCycleBlock(null)).toBe('')
    expect(renderCircleCycleBlock('')).toBe('')
  })
})

describe('renderAffectionClimateBlock', () => {
  it('lista el afecto por persona con marco de cuidado', () => {
    const b = renderAffectionClimateBlock([
      { name: 'Diana Carolina', description: 'el afecto expresado viene subiendo; el balance reciente está bastante más positivo que negativo' },
    ])
    expect(b).toContain('== CLIMA AFECTIVO')
    expect(b).toContain('afecto EXPRESADO ≠ afecto SENTIDO')
    expect(b).toContain('- Diana Carolina: el afecto expresado viene subiendo')
  })
  it('vacío si no hay entradas con dato', () => {
    expect(renderAffectionClimateBlock([])).toBe('')
    expect(renderAffectionClimateBlock([{ name: 'X', description: '' }])).toBe('')
  })
})

describe('renderAgendaBlock', () => {
  it('lista eventos ordenables con vencimiento relativo y origen', () => {
    const b = renderAgendaBlock([
      { date: '2026-08-07', title: 'Examen médico', sourceLabel: 'Google' },
      { date: '2026-07-26', title: 'Ver depa', personName: 'Diana', sourceLabel: 'plan' },
    ], '2026-07-24')
    expect(b).toContain('== AGENDA / EVENTOS PRÓXIMOS')
    expect(b).toContain('2026-08-07 (en 14 días): Examen médico [Google]')
    expect(b).toContain('2026-07-26 (en 2 días): Ver depa · con Diana [plan]')
  })
  it('vacío si no hay eventos', () => {
    expect(renderAgendaBlock([], '2026-07-24')).toBe('')
  })
})

describe('selectRecentHealth + renderHealthBlock', () => {
  it('toma la última noche y la lectura más reciente de cada métrica', () => {
    const snap = selectRecentHealth(
      [
        { type: 'weight', value: 78.4, unit: 'kg', measuredAt: '2026-07-23T12:00:00Z' },
        { type: 'weight', value: 79.0, unit: 'kg', measuredAt: '2026-07-20T12:00:00Z' },
        { type: 'sleeping_heart_rate', value: 52, unit: 'bpm', measuredAt: '2026-07-24T06:00:00Z' },
        { type: 'blood_oxygen', value: 97, unit: '%', measuredAt: '2026-07-24T06:00:00Z' },
      ],
      [
        { date: '2026-07-24', duration: 7.25, quality: 8, score: 86, awakenings: 1 },
        { date: '2026-07-23', duration: 6.0, quality: 6, score: 70, awakenings: 3 },
      ],
    )
    expect(snap.sleep?.date).toBe('2026-07-24')
    // La lectura de peso más reciente (23-jul), no la vieja.
    expect(snap.metrics.find((m) => m.label === 'Peso')?.value).toBe(78.4)
    const block = renderHealthBlock(snap)
    expect(block).toContain('== SALUD RECIENTE')
    expect(block).toContain('Sueño (2026-07-24): duró 7h15 · score 86/100 · 1 despertar')
    expect(block).toContain('Peso: 78.4 kg')
    expect(block).toContain('SpO₂: 97 %')
  })
  it('cae a calidad 1-10 si no hay score, y vacío si no hay data', () => {
    const b = renderHealthBlock(selectRecentHealth([], [{ date: '2026-07-24', duration: 8, quality: 7, score: null, awakenings: null }]))
    expect(b).toContain('duró 8h · calidad 7/10')
    expect(renderHealthBlock(selectRecentHealth([], []))).toBe('')
  })
})

describe('renderRemindersBlock', () => {
  it('lista pendientes con vencimiento relativo', () => {
    const b = renderRemindersBlock([
      { text: 'Examen médico', dueAt: '2026-08-07T14:00:00Z', personName: null },
      { text: 'Llamar al banco', dueAt: '2026-07-24T09:00:00Z', personName: 'Papá' },
    ], '2026-07-24')
    expect(b).toContain('== RECORDATORIOS PENDIENTES')
    expect(b).toContain('Examen médico — vence 2026-08-07 (en 14 días)')
    expect(b).toContain('Llamar al banco · Papá — vence 2026-07-24 (hoy)')
  })
  it('vacío si no hay', () => {
    expect(renderRemindersBlock([], '2026-07-24')).toBe('')
  })
})

describe('renderDealsBlock', () => {
  it('lista deals abiertos con etapa, monto y próxima acción', () => {
    const b = renderDealsBlock([
      { title: 'Sienna Minerals', stage: 'propuesta', amount: 120000, currency: 'PEN', nextAction: 'Enviar cotización', nextActionDate: '2026-07-28', contactName: 'Ivis' },
    ])
    expect(b).toContain('== OPORTUNIDADES ABIERTAS')
    expect(b).toContain('Sienna Minerals · etapa propuesta · PEN 120000 · contacto Ivis · próxima acción: Enviar cotización (2026-07-28)')
  })
  it('vacío si no hay', () => {
    expect(renderDealsBlock([])).toBe('')
  })
})

describe('renderTensionAlertsBlock', () => {
  it('lista alertas activas con persona', () => {
    const b = renderTensionAlertsBlock([
      { personName: 'Diana', fromLabel: 'estable', toLabel: 'en_tension', message: 'pasó de estable a en_tensión', createdAt: '2026-07-22T00:00:00Z' },
    ])
    expect(b).toContain('== ALERTAS DE TENSIÓN')
    expect(b).toContain('Diana: pasó de estable a en_tensión (2026-07-22)')
  })
  it('vacío si no hay', () => {
    expect(renderTensionAlertsBlock([])).toBe('')
  })
})

import { isPerspectiveQuery, selectStrengthMemories } from './ask'

describe('isPerspectiveQuery', () => {
  it('detecta consultas de estado/ánimo', () => {
    expect(isPerspectiveQuery('me siento como un barco hundiéndose')).toBe(true)
    expect(isPerspectiveQuery('no doy más con todo')).toBe(true)
    expect(isPerspectiveQuery('dame perspectiva')).toBe(true)
  })
  it('no se activa en consultas normales', () => {
    expect(isPerspectiveQuery('¿cuándo cumple Francisco?')).toBe(false)
    expect(isPerspectiveQuery('¿cómo voy con Sienna?')).toBe(false)
  })
})

describe('selectStrengthMemories', () => {
  it('selecciona memorias con léxico de fuerza, más recientes primero', () => {
    const out = selectStrengthMemories([
      { content: 'Hoy llovió', occurredAt: '2026-06-18' },
      { content: 'Aaron: yo siempre puedo con todo, salí adelante antes', occurredAt: '2026-06-17' },
      { content: 'Gané la medalla, fui campeón', occurredAt: '2026-06-19' },
    ], 5)
    expect(out.length).toBe(2)
    expect(out[0]).toMatch(/campeón/i)   // 19 antes que 17
  })
  it('ignora memorias sin fuerza', () => {
    expect(selectStrengthMemories([{ content: 'compré pan', occurredAt: '2026-06-18' }])).toHaveLength(0)
  })
})

describe('buildReceipts', () => {
  it('arma recibos con persona + texto + origen, cap por persona', () => {
    const r = buildReceipts([
      { name: 'Dayana', memories: [
        { content: 'Le diste SEO y fulfillment', source: 'whatsapp_capture' },
        { content: 'Maneja Nutriday', source: 'inferred' },
        { content: 'Ex Jhodaal', source: 'inferred' },
        { content: 'cuarta — se corta', source: 'manual' },
      ] },
    ], { perPerson: 3 })
    expect(r).toHaveLength(3)
    expect(r[0]).toEqual({ person: 'Dayana', text: 'Le diste SEO y fulfillment', source: 'whatsapp_capture' })
    expect(r.map((x) => x.text)).not.toContain('cuarta — se corta')
  })
  it('dedupe por texto y respeta el cap total', () => {
    const r = buildReceipts([
      { name: 'A', memories: [{ content: 'igual', source: 'manual' }] },
      { name: 'B', memories: [{ content: 'igual', source: 'inferred' }, { content: 'otra', source: 'manual' }] },
    ], { cap: 5 })
    expect(r.map((x) => x.text)).toEqual(['igual', 'otra']) // 'igual' de B se descarta (dup)
  })
  it('descarta vacíos y clampa el cap total', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ content: `m${i}`, source: 'manual' as const }))
    const r = buildReceipts([{ name: 'X', memories: [{ content: '  ', source: 'manual' }, ...many] }], { perPerson: 20, cap: 6 })
    expect(r).toHaveLength(6)
    expect(r.every((x) => x.text.length > 0)).toBe(true)
  })
  it('conserva source undefined (memoria legada sin origen)', () => {
    const r = buildReceipts([{ name: 'X', memories: [{ content: 'vieja' }] }])
    expect(r[0].source).toBeUndefined()
  })
})

// Antes del 28-jul-2026 el chat era CIEGO a `objective_steps`: con 151 pasos
// cargados no podía responder "¿cómo voy con Boticas?". Estos tests fijan que el
// avance REAL llegue al prompt.
describe('buildAskContext — sub-pasos de los objetivos', () => {
  const base = { question: '¿cómo voy con Boticas?', todayISO: '2026-07-28', people: [], memories: [] }

  it('pone el avance con el detalle de pasos', () => {
    const ctx = buildAskContext({
      ...base,
      goals: [{ title: 'Cerrar Boticas Jhodaal', progress: 15, stepsDone: 3, stepsTotal: 20 }],
    })
    expect(ctx).toContain('avance 15%')
    expect(ctx).toContain('3/20 pasos')
  })

  it('dice los VENCIDOS — es la señal más honesta de un plan muerto', () => {
    const ctx = buildAskContext({
      ...base,
      goals: [{ title: 'Cerrar Boticas Jhodaal', progress: 0, stepsDone: 0, stepsTotal: 20, overdue: 14 }],
    })
    expect(ctx).toContain('14 paso(s) VENCIDOS')
  })

  it('el próximo paso CONCRETO gana sobre el next_action escrito a mano', () => {
    const ctx = buildAskContext({
      ...base,
      goals: [{
        title: 'Cerrar Boticas Jhodaal',
        nextAction: 'texto viejo escrito a mano',
        nextStep: 'Agendar reunión con Dayana', nextStepDue: '2026-08-02',
      }],
    })
    expect(ctx).toContain('Agendar reunión con Dayana')
    expect(ctx).toContain('vence 2026-08-02')
    expect(ctx).not.toContain('texto viejo escrito a mano')
  })

  it('sin pasos cae al next_action de siempre (no rompe lo que ya andaba)', () => {
    const ctx = buildAskContext({ ...base, goals: [{ title: 'Objetivo suelto', nextAction: 'Hacer algo' }] })
    expect(ctx).toContain('próximo paso: Hacer algo')
  })

  it('no inventa cifras cuando no hay pasos', () => {
    const ctx = buildAskContext({ ...base, goals: [{ title: 'Objetivo sin plan' }] })
    expect(ctx).toContain('Objetivo sin plan')
    expect(ctx).not.toMatch(/avance \d/)
    expect(ctx).not.toMatch(/VENCIDOS/)
  })

  it('el NORTE también muestra su avance', () => {
    const ctx = buildAskContext({
      ...base,
      goals: [{ title: 'Ganar el Mundial', isAnchor: true, progress: 4, stepsDone: 1, stepsTotal: 25, overdue: 4 }],
    })
    const norte = ctx.slice(ctx.indexOf('== TU NORTE'), ctx.indexOf('== OBJETIVOS ACTIVOS'))
    expect(norte).toContain('avance 4%')
    expect(norte).toContain('4 paso(s) VENCIDOS')
  })
})

// FRICCIÓN REAL (29-jul-2026). El brief avisó "Hoy vence: Emitir factura
// electrónica #1 por fee mensual S/1,500" y Aaron respondió: "ni siquiera sé de qué
// o por qué o a quién, y pregunto y no tengo respuesta". El paso tenía TODO cargado
// desde el 3-jun y el chat no lo veía. Avisar de algo que después no se puede
// explicar es ruido, no asistencia.
describe('buildAskContext — el detalle del paso, para poder RESPONDER', () => {
  const base = { question: '¿qué factura tengo que emitir?', todayISO: '2026-07-29', people: [], memories: [] }

  it('lleva el cómo y el criterio de hecho junto al paso', () => {
    const ctx = buildAskContext({
      ...base,
      goals: [{
        title: 'Cerrar Boticas Jhodaal como cliente de Marlab',
        nextStep: 'Emitir factura electrónica #1 por fee mensual S/1,500 (mes jul-2026)',
        nextStepDue: '2026-07-29',
        nextStepDetail: 'Usar sistema de facturación de Marlab; enviar a Dayana por email',
        nextStepDone: 'Factura electrónica emitida y enviada a Boticas Jhodaal',
      }],
    })
    // Las tres preguntas que hizo: de qué, a quién, y cuándo está lista.
    expect(ctx).toContain('S/1,500')
    expect(ctx).toContain('enviar a Dayana por email')
    expect(ctx).toContain('queda hecho cuando: Factura electrónica emitida')
    expect(ctx).toContain('Boticas Jhodaal')
  })

  it('sin detalle no inventa corchetes vacíos', () => {
    const ctx = buildAskContext({ ...base, goals: [{ title: 'X', nextStep: 'Hacer algo' }] })
    expect(ctx).toContain('próximo paso: Hacer algo')
    expect(ctx).not.toContain('[]')
    expect(ctx).not.toContain('cómo:')
  })
})

// La fricción del 29-jul: el brief avisó "Hoy vence: Emitir factura electrónica #1
// por fee mensual S/1,500" y Aaron preguntó "¿Qué factura mensual?". SIR le
// repitió el título. El dato estaba —la descripción del paso decía "enviar a
// Dayana por email" y el objetivo padre, "Cerrar Boticas Jhodaal", estaba PAUSADO
// desde que ella se fue con otra gente— pero no llegaba al prompt.
describe('buildAskContext — pendientes con fecha', () => {
  const base = { question: 'que factura mensual?', todayISO: '2026-07-29', people: [], memories: [], goals: [] }
  const factura = {
    title: 'Emitir factura electrónica #1 por fee mensual S/1,500 (mes jul-2026)',
    due: '2026-07-29',
    detail: 'Usar sistema de facturación de Marlab; enviar a Dayana por email',
    goalTitle: 'Cerrar Boticas Jhodaal como cliente de Marlab',
    goalStatus: 'paused',
  }

  it('el pendiente llega con objetivo, detalle y fecha', () => {
    const out = buildAskContext({ ...base, pendingTasks: [factura] })
    expect(out).toContain('PENDIENTES CON FECHA')
    expect(out).toContain('vence 2026-07-29')
    expect(out).toContain('Cerrar Boticas Jhodaal')
    expect(out).toContain('Dayana')
  })

  it('un objetivo PAUSADO se marca, porque el pendiente ya no aplica', () => {
    const out = buildAskContext({ ...base, pendingTasks: [factura] })
    expect(out).toContain('[PAUSED]')
    expect(out).toMatch(/PAUSADO o ARCHIVADO/)
    expect(out).toMatch(/dilo PRIMERO/)
  })

  it('un objetivo activo NO se marca (no hay nada que advertir)', () => {
    const out = buildAskContext({
      ...base,
      pendingTasks: [{ ...factura, goalTitle: 'Subir ingresos', goalStatus: 'active' }],
    })
    expect(out).not.toContain('[ACTIVE]')
  })

  it('instruye a NO repetir el título', () => {
    const out = buildAskContext({ ...base, pendingTasks: [factura] })
    expect(out).toMatch(/no le repitas el título/i)
  })

  it('sin pendientes no agrega el bloque', () => {
    expect(buildAskContext({ ...base, pendingTasks: [] })).not.toContain('PENDIENTES CON FECHA')
    expect(buildAskContext(base)).not.toContain('PENDIENTES CON FECHA')
  })
})

describe('🩺 isExamQuery + renderExamsBlock', () => {
  // `health_exams` guardaba summary/findings/recommendations desde la mig 0149 y
  // NADIE los leía. La tomografía del 27-jul entró con 11 recomendaciones —incluida
  // la bandera del hematoma septal, ventana de DÍAS— y SIR no podía nombrar ninguna.
  const TOMO = {
    examDate: '2026-07-27',
    provider: 'SANNA Clínica San Borja',
    title: 'TEM de emergencia — encéfalo + macizo facial',
    summary: 'Encéfalo normal. Macizo facial sin trazos de fractura desplazados.',
    findings: [
      { code: 'J34.3', label: 'Hipertrofia de cornetes derechos' },
      { code: 'Z01.6', label: 'TC de encéfalo sin hemorragia' },
    ],
    values: [
      { name: 'Mucosa cornetes derechos', value: '7', unit: ' mm', flag: 'high' as const },
      { name: 'Algo normal', value: '5', flag: 'normal' as const },
    ],
    recommendations: ['Descartar hematoma septal con rinoscopio', 'Pedir SCOAT6'],
  }

  it('reconoce preguntas por exámenes que isHealthQuery NO cubre', () => {
    expect(isExamQuery('qué dijo mi tomografía?')).toBe(true)
    expect(isExamQuery('cómo salió mi hemograma')).toBe(true)
    expect(isExamQuery('mis resultados de laboratorio')).toBe(true)
    expect(isExamQuery('qué hallazgos tengo')).toBe(true)
    // Y no se dispara con cualquier cosa.
    expect(isExamQuery('cómo va Marlab')).toBe(false)
  })

  it('rinde resumen, hallazgos y recomendaciones — que es lo que no se leía', () => {
    const b = renderExamsBlock([TOMO])
    expect(b).toContain('TEM de emergencia')
    expect(b).toContain('sin trazos de fractura desplazados')
    expect(b).toContain('J34.3')
    expect(b).toContain('hematoma septal')
    expect(b).toContain('SCOAT6')
  })

  it('trae los valores FUERA de rango y omite los normales (son cientos)', () => {
    const b = renderExamsBlock([TOMO])
    expect(b).toContain('Mucosa cornetes derechos')
    expect(b).not.toContain('Algo normal')
  })

  it('prohíbe convertirlo en diagnóstico y prohíbe inventar un examen que no está', () => {
    const b = renderExamsBlock([TOMO])
    expect(b.toLowerCase()).toContain('nunca los conviertas en diagnóstico')
    expect(b.toLowerCase()).toContain('no lo tienes cargado')
  })

  it('los más recientes primero, aunque lleguen desordenados', () => {
    const viejo = { ...TOMO, examDate: '2026-05-02', title: 'Preocupacional' }
    const b = renderExamsBlock([viejo, TOMO])
    expect(b.indexOf('2026-07-27')).toBeLessThan(b.indexOf('2026-05-02'))
  })

  it("'' cuando no hay exámenes o vienen inválidos", () => {
    expect(renderExamsBlock([])).toBe('')
    expect(renderExamsBlock([{ ...TOMO, title: '' }])).toBe('')
  })
})
