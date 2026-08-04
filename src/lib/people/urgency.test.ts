import { describe, it, expect } from 'vitest'

import {
  scoreContactUrgency,
  stageUrgency,
  contactFrequencyDays,
  type ContactUrgencyInput,
} from './urgency'

function baseInput(over: Partial<ContactUrgencyInput> = {}): ContactUrgencyInput {
  return {
    fuerza: 50,
    reciprocidad: null,
    confianza: 50,
    category: 'network',
    status: 'active',
    daysSinceContact: 0,
    contactFrequencyDays: 30,
    hasUpcomingDate: false,
    recentSignalCount: 0,
    ...over,
  }
}

describe('stageUrgency (deriva el "stage" de v1 desde status + category)', () => {
  it('dormido y tenso urgen más que cualquier activo', () => {
    expect(stageUrgency('inner_circle', 'dormant')).toBe(80)
    expect(stageUrgency('inner_circle', 'strained')).toBe(70)
  })
  it('dentro de activos: periférico urge más que círculo íntimo', () => {
    expect(stageUrgency('peripheral', 'active')).toBe(50)
    expect(stageUrgency('network', 'active')).toBe(40)
    expect(stageUrgency('close', 'active')).toBe(20)
    expect(stageUrgency('inner_circle', 'active')).toBe(15)
  })
  it('sin status (sin relación registrada) cae por categoría', () => {
    expect(stageUrgency('network', undefined)).toBe(40)
  })
})

describe('contactFrequencyDays (parsea el texto libre de V2)', () => {
  it('palabras clave en español', () => {
    expect(contactFrequencyDays('semanal', 'network')).toBe(7)
    expect(contactFrequencyDays('Mensual', 'network')).toBe(30)
    expect(contactFrequencyDays('quincenal', 'network')).toBe(14)
    expect(contactFrequencyDays('trimestral', 'network')).toBe(90)
  })
  it('inglés', () => {
    expect(contactFrequencyDays('weekly', 'network')).toBe(7)
    expect(contactFrequencyDays('monthly', 'network')).toBe(30)
  })
  it('"cada N días" y N suelto', () => {
    expect(contactFrequencyDays('cada 10 días', 'network')).toBe(10)
    expect(contactFrequencyDays('cada 3 dias', 'network')).toBe(3)
    expect(contactFrequencyDays('21', 'network')).toBe(21)
  })
  it('vacío → fallback por categoría', () => {
    expect(contactFrequencyDays('', 'inner_circle')).toBe(7)
    expect(contactFrequencyDays(undefined, 'close')).toBe(14)
    expect(contactFrequencyDays(null, 'network')).toBe(30)
    expect(contactFrequencyDays('   ', 'peripheral')).toBe(60)
  })
  it('texto no reconocido → fallback por categoría', () => {
    expect(contactFrequencyDays('cuando me acuerdo', 'network')).toBe(30)
  })
})

describe('scoreContactUrgency (fórmula portada de v1)', () => {
  it('vínculo al día y fuerte → urgencia baja', () => {
    const r = scoreContactUrgency(
      baseInput({ fuerza: 80, confianza: 80, daysSinceContact: 2, contactFrequencyDays: 30, category: 'close' }),
    )
    expect(r.urgency).toBe('low')
    expect(r.reason).toBe('Al día — mantené el ritmo')
  })

  it('contacto muy vencido eleva la urgencia', () => {
    const r = scoreContactUrgency(
      baseInput({ fuerza: 40, confianza: 40, daysSinceContact: 90, contactFrequencyDays: 30 }),
    )
    expect(r.components.overdueScore).toBe(100) // min(100, (90/30)*50)=min(100,150)
    expect(r.urgency === 'high' || r.urgency === 'medium').toBe(true)
    expect(r.reason).toContain('Sin hablar hace 90 días')
  })

  it('vínculo dormido manda la razón aunque el contacto sea reciente', () => {
    const r = scoreContactUrgency(baseInput({ status: 'dormant', daysSinceContact: 1 }))
    expect(r.components.stageUrgency).toBe(80)
    expect(r.reason).toBe('Relación dormida — reactivala antes de que cueste')
  })

  it('fecha próxima suma +30 y manda la razón', () => {
    const withDate = scoreContactUrgency(baseInput({ hasUpcomingDate: true, daysSinceContact: 5 }))
    const without = scoreContactUrgency(baseInput({ hasUpcomingDate: false, daysSinceContact: 5 }))
    expect(withDate.score - without.score).toBe(30)
    expect(withDate.reason).toBe('Tiene una fecha importante cerca')
  })

  it('señal reciente suma +10', () => {
    const withSig = scoreContactUrgency(baseInput({ recentSignalCount: 2, daysSinceContact: 5 }))
    const without = scoreContactUrgency(baseInput({ recentSignalCount: 0, daysSinceContact: 5 }))
    expect(withSig.score - without.score).toBe(10)
  })

  it('nunca contactado (daysSinceContact null) usa ratio 1.5', () => {
    const r = scoreContactUrgency(baseInput({ daysSinceContact: null }))
    expect(r.components.overdueScore).toBe(75) // (1.5)*50
    expect(r.reason).toBe('Sin contacto registrado todavía')
  })

  it('reciprocidad null se trata como 50 neutral (no rompe el cálculo)', () => {
    const nullRecip = scoreContactUrgency(baseInput({ reciprocidad: null, fuerza: 50, confianza: 50 }))
    const recip50 = scoreContactUrgency(baseInput({ reciprocidad: 50, fuerza: 50, confianza: 50 }))
    expect(nullRecip.components.relScore).toBe(recip50.components.relScore)
  })

  it('umbral de urgencia: >=65 high, >=40 medium, resto low', () => {
    // fuerza/confianza muy bajas + dormido + vencido → high
    const high = scoreContactUrgency(
      baseInput({ fuerza: 10, confianza: 10, status: 'dormant', daysSinceContact: 120, contactFrequencyDays: 14 }),
    )
    expect(high.urgency).toBe('high')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// EL CASO REAL DEL 4-ago-2026
//
// El brief le mandó, literal y nada más: "Tiene una fecha importante cerca — tu
// pareja". Aaron: "no me dices quién ni me dices qué hacer, entonces esa
// información así vacía no me ayuda". Y el dato estaba completo: Diana tiene
// "Aniversario Aaron y Diana" el 13-ago (verificado en people.special_dates),
// y contactDatesInRange ya había calculado la etiqueta, los días y el empujón.
// Se perdía dos capas arriba, colapsado a un booleano.
// ═══════════════════════════════════════════════════════════════════════════

describe('buildReason con fecha próxima: dice QUÉ, CUÁNDO y QUÉ HACER', () => {
  const aniversario = { label: 'Aniversario Aaron y Diana', daysUntil: 9, nudge: 'Planea algo especial' }

  it('el caso de Diana: ya no es una generalidad', () => {
    const r = scoreContactUrgency(baseInput({
      hasUpcomingDate: true, upcomingDate: aniversario, daysSinceContact: 5, category: 'inner_circle',
    }))
    expect(r.reason).toContain('Aniversario Aaron y Diana')   // QUÉ
    expect(r.reason).toContain('en 9 días')                   // CUÁNDO
    expect(r.reason).toContain('planea algo especial')        // QUÉ HACER
    expect(r.reason).not.toBe('Tiene una fecha importante cerca')
  })

  it('HOY y MAÑANA se dicen con esas palabras, no con un número', () => {
    const hoy = scoreContactUrgency(baseInput({
      hasUpcomingDate: true, upcomingDate: { ...aniversario, daysUntil: 0, nudge: 'Es ya: confirma tu plan' },
    }))
    expect(hoy.reason).toContain('HOY')
    expect(hoy.reason).not.toContain('en 0 días')
    const manana = scoreContactUrgency(baseInput({
      hasUpcomingDate: true, upcomingDate: { ...aniversario, daysUntil: 1, nudge: 'Es ya: confirma tu plan' },
    }))
    expect(manana.reason).toContain('MAÑANA')
    expect(manana.reason).not.toContain('en 1 días')
  })

  it('la fecha le gana a los otros motivos (es lo más accionable que hay)', () => {
    // Una relación dormida y sin contacto igual reporta la FECHA: es la que tiene
    // vencimiento real. Antes también ganaba, pero para decir una generalidad.
    const r = scoreContactUrgency(baseInput({
      hasUpcomingDate: true, upcomingDate: aniversario, status: 'dormant', daysSinceContact: null,
    }))
    expect(r.reason).toContain('Aniversario Aaron y Diana')
  })

  it('sin el detalle NO se calla: cae a la frase vieja (avisar en general > no avisar)', () => {
    const r = scoreContactUrgency(baseInput({ hasUpcomingDate: true, daysSinceContact: 5 }))
    expect(r.reason).toBe('Tiene una fecha importante cerca')
  })

  it('el bonus de score de la fecha no cambió (no se tocó la priorización)', () => {
    const conDetalle = scoreContactUrgency(baseInput({ hasUpcomingDate: true, upcomingDate: aniversario, daysSinceContact: 5 }))
    const soloBool = scoreContactUrgency(baseInput({ hasUpcomingDate: true, daysSinceContact: 5 }))
    expect(conDetalle.score).toBe(soloBool.score)
  })

  it('sin fecha próxima, los motivos de siempre siguen intactos', () => {
    expect(scoreContactUrgency(baseInput({ status: 'dormant' })).reason)
      .toContain('Relación dormida')
    expect(scoreContactUrgency(baseInput({ daysSinceContact: null })).reason)
      .toBe('Sin contacto registrado todavía')
    expect(scoreContactUrgency(baseInput({ daysSinceContact: 60, contactFrequencyDays: 30 })).reason)
      .toContain('Sin hablar hace 60 días')
  })
})
