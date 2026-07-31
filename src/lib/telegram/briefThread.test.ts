import { describe, it, expect } from 'vitest'
import { buildBriefThread, buildSectionButtons, parseBriefCallback, briefCallbackData, muteRef, etiquetaCorta } from './briefThread'
import { topicKey, type MorningSignal } from '@/lib/push/morning'

const s = (section: MorningSignal['section'], text: string, slot = 'x'): MorningSignal => ({ slot, section, text })

describe('buildBriefThread', () => {
  it('parte en un mensaje por sección, en orden hoy → gente → metas', () => {
    const out = buildBriefThread([
      s('metas', 'Boticas Jhodaal cierra en 6 días y vas 0%'),
      s('gente', 'Hace 3 semanas sin hablar con tu mamá'),
      s('hoy', 'Hoy vence: UAT con Dayana'),
    ])
    expect(out.map((m) => m.section)).toEqual(['hoy', 'gente', 'metas'])
    expect(out[0].text).toContain('⚡ HOY')
    expect(out[1].text).toContain('💚 TU GENTE')
    expect(out[2].text).toContain('🎯 TUS METAS')
  })

  it('saluda solo en el primero y cierra solo en el último', () => {
    const out = buildBriefThread([s('hoy', 'a'), s('gente', 'b'), s('metas', 'c')])
    expect(out[0].text.startsWith('🌿 Buen día')).toBe(true)
    expect(out[1].text).not.toContain('Buen día')
    expect(out[2].text).toContain('Responde a cualquiera')
    expect(out[0].text).not.toContain('Responde a cualquiera')
  })

  it('con una sola sección, saludo y cierre van en el mismo mensaje', () => {
    const [only] = buildBriefThread([s('hoy', 'Hoy vence: UAT con Dayana')])
    expect(only.text).toContain('🌿 Buen día')
    expect(only.text).toContain('Responde a cualquiera')
    expect(only.text).toContain('Hoy vence: UAT con Dayana')
  })

  it('una señal va pelada; varias van con viñeta', () => {
    const [uno] = buildBriefThread([s('hoy', 'solo esto')])
    expect(uno.text).not.toContain('· solo esto')
    const [dos] = buildBriefThread([s('hoy', 'primero'), s('hoy', 'segundo')])
    expect(dos.text).toContain('· primero')
    expect(dos.text).toContain('· segundo')
  })

  it('secciones vacías no generan mensaje; sin señales devuelve []', () => {
    expect(buildBriefThread([]).length).toBe(0)
    expect(buildBriefThread([s('gente', 'x')]).length).toBe(1)
  })

  it('ignora señales sin texto', () => {
    expect(buildBriefThread([s('hoy', ''), s('gente', 'ok')]).length).toBe(1)
  })

  it('ningún mensaje se acerca al límite de Telegram', () => {
    const many = Array.from({ length: 8 }, (_, i) => s('gente', `señal larga número ${i} `.repeat(10)))
    for (const m of buildBriefThread(many)) expect(m.text.length).toBeLessThan(4000)
  })
})

describe('botones del hilo', () => {
  const tarea: MorningSignal = {
    slot: 'dueTask', section: 'hoy', text: 'Hoy vence: UAT con Dayana',
    entity: { kind: 'task', id: 'step_123', name: 'UAT con Dayana' },
  }
  const mama: MorningSignal = {
    slot: 'relationshipNudge', section: 'gente', text: 'Hace 3 semanas sin hablar con Maria Isabel — tu mamá',
    entity: { kind: 'person', id: 'per_maria', name: 'Maria Isabel Espinoza' },
  }
  const momento: MorningSignal = {
    slot: 'momentResolution', section: 'gente', text: 'El conflicto por el Mundial parece resuelto — ¿lo cierras?',
    entity: { kind: 'moment', id: 'mom_9', name: 'Conflicto Mundial' },
  }
  const meta: MorningSignal = {
    slot: 'goalNudge', section: 'metas', text: 'Boticas Jhodaal vence en 6 días y vas 0%',
    entity: { kind: 'goal', id: 'g_1780473004', name: 'Boticas Jhodaal' },
  }

  const labels = (rows: { text: string }[][]) => rows.flat().map((b) => b.text)

  it('la tarea ofrece marcarla y posponerla', () => {
    expect(labels(buildSectionButtons([tarea]))).toEqual(
      // CAMBIO DELIBERADO (31-jul-2026): el botón ahora NOMBRA la tarea. Antes decía
      // '✅ Ya lo hice' a secas y con 5 viñetas en la misma sección era imposible saber
      // a cuál apuntaba — Aaron: 'no puedo marcar que hice una sola cosa'.
      expect.arrayContaining(['✅ Hice: UAT con Dayana', '⏰ Recuérdamelo 6pm']),
    )
  })

  it('la persona ofrece un borrador, con su nombre de pila', () => {
    expect(labels(buildSectionButtons([mama]))).toContain('✍️ Escríbele a Maria')
  })

  it('el momento ofrece cerrarlo y el objetivo el próximo paso', () => {
    expect(labels(buildSectionButtons([momento]))).toContain('✅ Dar por cerrado')
    expect(labels(buildSectionButtons([meta]))).toContain('🚀 Dame el próximo paso')
  })

  it('siempre hay UN solo 🔕, y calla lo repetible (el momento antes que el nudge)', () => {
    const rows = buildSectionButtons([mama, momento])
    const mutes = rows.flat().filter((b) => b.text.startsWith('🔕'))
    expect(mutes).toHaveLength(1)
    expect(mutes[0].callbackData).toBe(`br|mute|${muteRef(momento.text, momento.slot)}`)
  })

  it('una tarea con fecha NO ofrece 🔕 (se resuelve sola, callarla es ruido)', () => {
    expect(labels(buildSectionButtons([tarea])).some((t) => t.startsWith('🔕'))).toBe(false)
  })

  it('una señal SIN entidad no inventa botones de acción', () => {
    const rows = buildSectionButtons([s('gente', 'Semana con carga afectiva: coinciden 6 personas', 'cycleWeekAhead')])
    const acciones = rows.flat().filter((b) => !b.text.startsWith('🔕'))
    expect(acciones).toHaveLength(0)
  })

  it('el hilo adjunta los botones a su sección', () => {
    const out = buildBriefThread([tarea, mama, meta])
    // Ver arriba: la etiqueta lleva el nombre de la tarea a propósito.
    expect(labels(out[0].buttons)).toContain('✅ Hice: UAT con Dayana')
    expect(labels(out[1].buttons)).toContain('✍️ Escríbele a Maria')
    expect(labels(out[2].buttons)).toContain('🚀 Dame el próximo paso')
  })
})

describe('callback_data', () => {
  it('ida y vuelta', () => {
    expect(parseBriefCallback('br|task_done|step_123')).toEqual({ kind: 'task_done', ref: 'step_123' })
    expect(parseBriefCallback(briefCallbackData('mute', 'abc123'))).toEqual({ kind: 'mute', ref: 'abc123' })
  })

  it('ignora lo que no es del brief o está mal formado', () => {
    expect(parseBriefCallback('hb|xyz')).toBeNull()
    expect(parseBriefCallback('br|inventado|x')).toBeNull()
    expect(parseBriefCallback('br|task_done|')).toBeNull()
    expect(parseBriefCallback('')).toBeNull()
  })

  it('respeta el límite de 64 bytes de Telegram', () => {
    expect(briefCallbackData('task_done', 'x'.repeat(200))).toBe('')
    for (const s of ['step_' + 'a'.repeat(30), '8758b7c2-9232-4db3-b0e8-dd489e339d40']) {
      expect(Buffer.byteLength(briefCallbackData('task_done', s))).toBeLessThanOrEqual(64)
    }
  })
})

describe('muteRef', () => {
  it('es estable para el mismo tema aunque cambie el número', () => {
    const hoy = 'Hace 3 semanas sin hablar con Maria Isabel Espinoza Vidaurre — tu mamá'
    const enUnMes = 'Hace 7 semanas sin hablar con Maria Isabel Espinoza Vidaurre — tu mamá'
    expect(topicKey(hoy)).toBe(topicKey(enUnMes))
    expect(muteRef(hoy)).toBe(muteRef(enUnMes))
  })

  it('distingue temas distintos', () => {
    expect(muteRef('Hoy vence: UAT con Dayana')).not.toBe(muteRef('Boticas Jhodaal vence en 6 días'))
  })

  it('cabe en el callback', () => {
    expect(muteRef('x'.repeat(500)).length).toBeLessThanOrEqual(8)
  })

  it('con slot agregado, el texto deja de importar (la lista del ciclo cambia a diario)', () => {
    const a = 'Semana afectiva cargada: coinciden Diana, Aeylin y Amira'
    const b = 'Semana afectiva cargada: coinciden Dayana, Nicolle y Carolina'
    expect(muteRef(a, 'cycleWeekAhead')).toBe(muteRef(b, 'cycleWeekAhead'))
    // Sin slot agregado, el tema sigue mandando: dos personas ≠ una señal.
    expect(muteRef(a, 'relationshipNudge')).not.toBe(muteRef(b, 'relationshipNudge'))
  })
})

describe('🎯 botones que DICEN a qué apuntan (la queja del 31-jul)', () => {
  const labels = (rows: { text: string }[][]) => rows.flat().map((b) => b.text)
  // Aaron: "antes SIR me mandaba una lista y podía marcar uno por uno lo que había
  // hecho, como tender la cama; ahora me mandó todo junto y no puedo marcar una sola
  // cosa". Su ⚡HOY traía 5 viñetas y UN "✅ Ya lo hice" que apuntaba a la tarea con
  // fecha; el hábito solo ofrecía 🔕.
  it('el botón de la tarea nombra la tarea', () => {
    const rows = buildSectionButtons([
      { slot: 'dueTask', section: 'hoy', text: 'Hoy vence: Pre-registrarme como atleta', entity: { kind: 'task', id: 't1', name: 'Pre-registrarme como atleta' } },
    ])
    expect(labels(rows)).toContainEqual(expect.stringContaining('Pre-registrarme'))
  })

  it('el HÁBITO ahora tiene botón de hecho, no solo 🔕', () => {
    const rows = buildSectionButtons([
      { slot: 'habitNudge', section: 'hoy', text: 'Se cortó tu racha de "Tender la cama". Un día no la define — retómala hoy.', entity: { kind: 'habit', id: 'h1', name: 'Tender la cama' } },
    ])
    const l = labels(rows)
    expect(l).toContainEqual(expect.stringContaining('Tender la cama'))
    expect(l.some((x) => x.startsWith('✅'))).toBe(true)
  })

  it('con tarea Y hábito juntos hay DOS botones distinguibles', () => {
    const rows = buildSectionButtons([
      { slot: 'dueTask', section: 'hoy', text: 'x', entity: { kind: 'task', id: 't1', name: 'Pre-registro del Mundial' } },
      { slot: 'habitNudge', section: 'hoy', text: 'y', entity: { kind: 'habit', id: 'h1', name: 'Tender la cama' } },
    ])
    const hechos = labels(rows).filter((x) => x.startsWith('✅ Hice:'))
    expect(hechos).toHaveLength(2)
    expect(hechos.join(' ')).toContain('Tender la cama')
    expect(hechos.join(' ')).toContain('Pre-registro')
  })

  it('el hábito sin entidad sigue sin botón de hecho (no inventa uno muerto)', () => {
    const rows = buildSectionButtons([
      { slot: 'habitNudge', section: 'hoy', text: 'Te faltan 3 hábitos por marcar hoy.' },
    ])
    expect(labels(rows).some((x) => x.startsWith('✅'))).toBe(false)
  })
})

describe('etiquetaCorta', () => {
  it('quita los prefijos del brief: el botón ya dice "Hice:"', () => {
    expect(etiquetaCorta('Hoy vence: Abrir cuenta bancaria')).toBe('Abrir cuenta bancaria')
    expect(etiquetaCorta('Se cortó tu racha de "Tender la cama"')).toBe('Tender la cama')
  })
  it('corta el contexto que viene después del separador', () => {
    expect(etiquetaCorta('Cerrar el plan técnico — de "Ganar el Mundial"')).toBe('Cerrar el plan técnico')
  })
  it('recorta lo muy largo con puntos suspensivos', () => {
    const r = etiquetaCorta('Pre-registrarme como atleta y esperar apertura de inscripción oficial')
    expect(r.length).toBeLessThanOrEqual(26)
  })
  it('no revienta con vacío', () => {
    expect(etiquetaCorta('')).toBe('')
  })
})
