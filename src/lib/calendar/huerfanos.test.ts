// SIR V2 — Tests de los duplicados huérfanos en Google.
//
// Caso real: el viernes 7-ago Aaron tenía DOS eventos del examen del IPD en Google (la
// banderita "todo el día" vieja y uno cronometrado a las 08:10), con UNA sola fila en
// `personal_events`. El huérfano nace cuando el update de `gcal_event_id` falla después
// de crear el evento: SIR pierde la referencia y la corrida siguiente crea otro.
import { describe, it, expect } from 'vitest'
import {
  huerfanosParaBorrar, huerfanosParaAdoptar, mismoTitulo, norm,
  type EventoGoogleLite, type EventoAdministrado,
} from './huerfanos'

const LARGO = 'Examen médico EPP — IPD San Luis · 8:10 am (paso al Mundial)'
const CORTO = 'Examen médico EPP'

describe('huerfanosParaBorrar — el duplicado real del 7-ago', () => {
  it('marca el huérfano y NO el que SIR apunta', () => {
    const google: EventoGoogleLite[] = [
      { id: 'viejo_huerfano', title: LARGO, start: '2026-08-07' },
      { id: 'e3iit1h9vk', title: CORTO, start: '2026-08-07T08:10:00-05:00' },
    ]
    const admin: EventoAdministrado[] = [{ title: LARGO, date: '2026-08-07', gcalEventId: 'e3iit1h9vk' }]
    const r = huerfanosParaBorrar(google, admin)
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('viejo_huerfano')
    expect(r[0].motivo).toContain('e3iit1h9vk')
  })

  it('empareja el título CORTO con el largo (los títulos se acortaron)', () => {
    expect(mismoTitulo(LARGO, CORTO)).toBe(true)
    expect(mismoTitulo('Cirugía Maxilofacial — Dr. Campos Soto (control)', 'Cirugía Maxilofacial')).toBe(true)
  })
})

describe('huerfanosParaBorrar — lo que NO toca', () => {
  it('no borra un evento de OTRO día aunque el título calce', () => {
    const google: EventoGoogleLite[] = [{ id: 'otro', title: LARGO, start: '2026-09-07' }]
    const admin: EventoAdministrado[] = [{ title: LARGO, date: '2026-08-07', gcalEventId: 'x' }]
    expect(huerfanosParaBorrar(google, admin)).toHaveLength(0)
  })

  it('no borra nada si SIR NO tiene su propia copia: ese podría SER el evento bueno', () => {
    const google: EventoGoogleLite[] = [{ id: 'quizas_el_bueno', title: LARGO, start: '2026-08-07' }]
    const admin: EventoAdministrado[] = [{ title: LARGO, date: '2026-08-07', gcalEventId: null }]
    expect(huerfanosParaBorrar(google, admin)).toHaveLength(0)
  })

  it('no toca eventos ajenos de Google (fases de la luna, feriados)', () => {
    const google: EventoGoogleLite[] = [
      { id: 'luna', title: 'Cuarto menguante 21:21', start: '2026-08-05' },
      { id: 'junin', title: 'Batalla de Junín', start: '2026-08-06' },
    ]
    const admin: EventoAdministrado[] = [{ title: LARGO, date: '2026-08-07', gcalEventId: 'x' }]
    expect(huerfanosParaBorrar(google, admin)).toHaveLength(0)
  })

  it('no empareja por una palabra suelta: exige prefijo sustancioso', () => {
    expect(mismoTitulo('Examen', 'Examen médico EPP — IPD San Luis')).toBe(false)
    expect(mismoTitulo('Boda', 'Boda de Laura y Rolando')).toBe(false)
  })

  it('no revienta con basura', () => {
    expect(huerfanosParaBorrar([], [])).toEqual([])
    expect(huerfanosParaBorrar(null as unknown as EventoGoogleLite[], [])).toEqual([])
    expect(mismoTitulo('', '')).toBe(false)
    expect(norm('Ceremonía — WFG26!')).toBe('ceremonia wfg26')
  })
})

describe('huerfanosParaAdoptar — mejor adoptar que borrar y recrear', () => {
  it('re-engancha la fila que perdió su referencia', () => {
    const google: EventoGoogleLite[] = [{ id: 'existe_en_google', title: LARGO, start: '2026-08-07' }]
    const admin: EventoAdministrado[] = [{ title: LARGO, date: '2026-08-07', gcalEventId: null }]
    const r = huerfanosParaAdoptar(google, admin)
    expect(r).toHaveLength(1)
    expect(r[0].gcalEventId).toBe('existe_en_google')
  })

  it('no adopta uno que ya está apuntado por otra fila', () => {
    const google: EventoGoogleLite[] = [{ id: 'ya_usado', title: LARGO, start: '2026-08-07' }]
    const admin: EventoAdministrado[] = [
      { title: LARGO, date: '2026-08-07', gcalEventId: 'ya_usado' },
      { title: LARGO, date: '2026-08-07', gcalEventId: null },
    ]
    expect(huerfanosParaAdoptar(google, admin)).toHaveLength(0)
  })

  it('no adopta si la fila ya tiene referencia', () => {
    const google: EventoGoogleLite[] = [{ id: 'otro', title: LARGO, start: '2026-08-07' }]
    const admin: EventoAdministrado[] = [{ title: LARGO, date: '2026-08-07', gcalEventId: 'tengo' }]
    expect(huerfanosParaAdoptar(google, admin)).toHaveLength(0)
  })
})
