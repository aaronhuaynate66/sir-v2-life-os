import { describe, it, expect } from 'vitest'
import { buildBriefThread, buildSectionButtons, parseBriefCallback, briefCallbackData, muteRef } from './briefThread'
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
      expect.arrayContaining(['✅ Ya lo hice', '⏰ Recuérdamelo 6pm']),
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
    expect(mutes[0].callbackData).toBe(`br|mute|${muteRef(momento.text)}`)
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
    expect(labels(out[0].buttons)).toContain('✅ Ya lo hice')
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
})
