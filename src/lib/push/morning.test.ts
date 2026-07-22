import { describe, it, expect } from 'vitest'
import { buildMorningPush } from './morning'

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
  it('va después de las fechas pero antes de las tareas', () => {
    const p = buildMorningPush({
      birthdays: [{ name: 'Pedro', days: 2 }],
      relationshipNudge: 'Sasa — Relación dormida',
      dueTasks: ['Cerrar reporte'],
    })
    expect(p.body.indexOf('Pedro')).toBeLessThan(p.body.indexOf('Sasa'))
    expect(p.body.indexOf('Sasa')).toBeLessThan(p.body.indexOf('Cerrar reporte'))
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
