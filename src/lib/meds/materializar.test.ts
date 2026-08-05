import { describe, expect, it } from 'vitest'

import { DIAS_DE_COLA, planDeTomas, type ItemVigente } from './materializar'

const UID = 'u1'

/** El esquema real de Aaron al 5-ago-2026, medido contra producción. */
const TOPIRAMATO: ItemVigente = {
  prescriptionId: 'presc_neuro_20260710',
  medName: 'Topiramato',
  dose: '100 mg',
  horas: ['22:00'],
  startedOn: '2026-07-10',
  durationDays: null, // crónico
  endsOn: null,
}
const CLONAZEPAM: ItemVigente = {
  prescriptionId: 'presc_clonazepam_nocturno',
  medName: 'Clonazepam',
  dose: '2 mg',
  horas: ['22:00'],
  startedOn: '2026-08-03',
  durationDays: null,
  endsOn: null,
}
const ETORICOXIB: ItemVigente = {
  prescriptionId: 'presc_maxilo_20260803',
  medName: 'Etoricoxib',
  dose: '120 mg',
  horas: ['22:00'],
  startedOn: '2026-08-03',
  durationDays: 7, // curso: 3 al 9-ago
  endsOn: '2026-08-09',
}

describe('planDeTomas', () => {
  it('un crónico llena la cola entera desde hoy', () => {
    const plan = planDeTomas([TOPIRAMATO], UID, '2026-08-05', 21)
    expect(plan).toHaveLength(21)
    expect(plan[0].due_at).toBe('2026-08-05T22:00:00-05:00')
    expect(plan[20].due_at).toBe('2026-08-25T22:00:00-05:00')
  })

  it('NO agenda el pasado aunque la receta sea vieja', () => {
    // El topiramato arrancó el 10-jul. Una ventana contada desde `started_on` caería
    // entera en el pasado y el fármaco de todas las noches se quedaría sin un solo
    // recordatorio — en silencio.
    const plan = planDeTomas([TOPIRAMATO], UID, '2026-08-05', 21)
    expect(plan.every((p) => p.due_at >= '2026-08-05')).toBe(true)
  })

  it('agrupa en UN aviso los medicamentos de la misma hora, aunque sean de recetas distintas', () => {
    const plan = planDeTomas([TOPIRAMATO, CLONAZEPAM, ETORICOXIB], UID, '2026-08-05', 3)
    const noche = plan.filter((p) => p.id === 'rem_med_2026-08-05_2200')
    expect(noche).toHaveLength(1) // no tres mensajes para una sola toma
    expect(noche[0].text).toBe('💊 Topiramato 100 mg + Clonazepam 2 mg + Etoricoxib 120 mg')
  })

  it('un curso con duración se corta en su último día; el crónico sigue', () => {
    const plan = planDeTomas([TOPIRAMATO, ETORICOXIB], UID, '2026-08-05', 10)
    const conEtoricoxib = plan.filter((p) => p.text.includes('Etoricoxib'))
    expect(conEtoricoxib.map((p) => p.due_at.slice(0, 10))).toEqual([
      '2026-08-05', '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09',
    ])
    // Y el 10-ago el aviso sigue existiendo, solo que sin el que terminó.
    const diez = plan.find((p) => p.due_at.startsWith('2026-08-10'))
    expect(diez?.text).toBe('💊 Topiramato 100 mg')
  })

  it('respeta ends_on aunque no haya duration_days', () => {
    const item: ItemVigente = { ...TOPIRAMATO, endsOn: '2026-08-07' }
    const plan = planDeTomas([item], UID, '2026-08-05', 21)
    expect(plan.map((p) => p.due_at.slice(0, 10))).toEqual(['2026-08-05', '2026-08-06', '2026-08-07'])
  })

  it('una receta que todavía no empieza se agenda desde su inicio, no desde hoy', () => {
    const futura: ItemVigente = { ...ETORICOXIB, startedOn: '2026-08-10', endsOn: null, durationDays: 3 }
    const plan = planDeTomas([futura], UID, '2026-08-05', 21)
    expect(plan.map((p) => p.due_at.slice(0, 10))).toEqual(['2026-08-10', '2026-08-11', '2026-08-12'])
  })

  it('ignora los ítems sin hora — lo que es a demanda no se agenda', () => {
    const ergonex: ItemVigente = { ...TOPIRAMATO, medName: 'Ergonex Plus', horas: [] }
    expect(planDeTomas([ergonex], UID, '2026-08-05', 7)).toHaveLength(0)
  })

  it('ignora horas con formato roto en vez de generar ids inválidos', () => {
    // Un id mal formado NO lo reconoce `horaDeRecordatorioDeToma`, así que el aviso
    // saldría sin los botones de registro. Mejor no crearlo.
    const roto: ItemVigente = { ...TOPIRAMATO, horas: ['tarde', '2200', ''] }
    expect(planDeTomas([roto], UID, '2026-08-05', 7)).toHaveLength(0)
  })

  it('soporta dos tomas al día como dos avisos distintos', () => {
    const dosVeces: ItemVigente = { ...TOPIRAMATO, horas: ['08:00', '22:00'] }
    const plan = planDeTomas([dosVeces], UID, '2026-08-05', 2)
    expect(plan.map((p) => p.id)).toEqual([
      'rem_med_2026-08-05_0800', 'rem_med_2026-08-05_2200',
      'rem_med_2026-08-06_0800', 'rem_med_2026-08-06_2200',
    ])
  })

  it('el id que arma es el MISMO que el cron sabe leer', () => {
    // Si estos dos formatos se separan, el aviso llega sin botones y en silencio.
    const plan = planDeTomas([TOPIRAMATO], UID, '2026-08-05', 1)
    expect(plan[0].id).toBe('rem_med_2026-08-05_2200')
  })

  it('EL CASO QUE SE IBA A APAGAR: la cola nunca se vacía si esto corre a diario', () => {
    // Medido el 5-ago-2026: la última fila en producción era `rem_med_2026-08-16_2200`.
    // Del 17-ago en adelante el cron no encontraba nada y respondía 200 OK.
    // Con una ventana RODANTE, cada día que corre empuja el horizonte un día más.
    const esquema = [TOPIRAMATO, CLONAZEPAM]
    for (const hoy of ['2026-08-16', '2026-08-17', '2026-09-01', '2026-12-25']) {
      const plan = planDeTomas(esquema, UID, hoy, DIAS_DE_COLA)
      expect(plan.length, `cola vacía el ${hoy}`).toBe(DIAS_DE_COLA)
      expect(plan[0].due_at.slice(0, 10)).toBe(hoy)
    }
  })
})
