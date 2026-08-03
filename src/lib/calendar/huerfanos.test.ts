// SIR V2 — Tests de los duplicados huérfanos en Google.
//
// Caso real: el viernes 7-ago Aaron tenía DOS eventos del examen del IPD en Google (la
// banderita "todo el día" vieja y uno cronometrado a las 08:10), con UNA sola fila en
// `personal_events`. El huérfano nace cuando el update de `gcal_event_id` falla después
// de crear el evento: SIR pierde la referencia y la corrida siguiente crea otro.
import { describe, it, expect } from 'vitest'
import {
  huerfanosParaBorrar, huerfanosParaAdoptar, claveChip, loCreoSir, mismoEvento, mismoTitulo, norm,
  type EventoGoogleLite, type EventoAdministrado,
} from './huerfanos'
import { descripcionParaGoogle } from './syncPersonalEvents'

const LARGO = 'Examen médico EPP — IPD San Luis · 8:10 am (paso al Mundial)'
const CORTO = 'Examen médico EPP'

/** El título que el huérfano REAL tenía en Google (creado el 24-jul). */
const LARGO_HUERFANO = 'Examen médico EPP — IPD (rumbo al Mundial de Bomberos)'
/** Una descripción como la que SIR escribe de verdad. */
const CON_MARCA = descripcionParaGoogle('8:10 am · LLEGAR 8:00 · Puerta 2 o 13, IPD San Luis.')

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

// ═══ EL HUECO DEL 3-AGO ═══
// El duplicado real sobrevivió a la limpieza y hubo que borrarlo a mano: los DOS
// títulos eran largos y divergían ("…IPD San Luis · 8:10 am" vs "…IPD (rumbo al
// Mundial)"), así que ninguno era prefijo del otro. Lo que sí coincidía era el chip.
describe('huerfanosParaBorrar — la vía del CHIP', () => {
  it('los dos títulos largos divergen: la regla de prefijo NO alcanza', () => {
    expect(mismoTitulo(LARGO, LARGO_HUERFANO)).toBe(false)
    // …pero los dos se acortan al mismo chip, que es lo que SIR escribe en Google.
    expect(claveChip(LARGO)).toBe(claveChip(LARGO_HUERFANO))
    expect(claveChip(LARGO)).toBe('examen medico epp')
  })

  it('CON la marca de SIR sí lo caza (el caso real del 7-ago)', () => {
    const google: EventoGoogleLite[] = [
      { id: 'n3o70cjboj', title: LARGO_HUERFANO, start: '2026-08-07T08:10:00-05:00', description: CON_MARCA },
      { id: 'e3iit1h9vk', title: CORTO, start: '2026-08-07T08:10:00-05:00', description: CON_MARCA },
    ]
    const admin: EventoAdministrado[] = [{ title: LARGO, date: '2026-08-07', gcalEventId: 'e3iit1h9vk' }]
    const r = huerfanosParaBorrar(google, admin)
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('n3o70cjboj')
  })

  it('SIN la marca NO lo toca: puede ser un evento que Aaron hizo a mano', () => {
    const google: EventoGoogleLite[] = [
      { id: 'a_mano', title: LARGO_HUERFANO, start: '2026-08-07T08:10:00-05:00' },
      { id: 'e3iit1h9vk', title: CORTO, start: '2026-08-07T08:10:00-05:00', description: CON_MARCA },
    ]
    const admin: EventoAdministrado[] = [{ title: LARGO, date: '2026-08-07', gcalEventId: 'e3iit1h9vk' }]
    expect(huerfanosParaBorrar(google, admin)).toHaveLength(0)
  })

  it('el chip corto no habilita nada, ni con la marca', () => {
    // "Cita" normalizado son 4 chars: por debajo del mínimo, así que dos citas
    // distintas del mismo día NO se emparejan por chip.
    const google: EventoGoogleLite[] = [
      { id: 'otra_cita', title: 'Cita — con el dentista', start: '2026-08-07', description: CON_MARCA },
    ]
    const admin: EventoAdministrado[] = [
      { title: 'Cita — con el contador', date: '2026-08-07', gcalEventId: 'la_mia' },
    ]
    expect(huerfanosParaBorrar(google, admin)).toHaveLength(0)
  })

  it('mismoEvento y loCreoSir, directo', () => {
    expect(loCreoSir({ description: CON_MARCA })).toBe(true)
    expect(loCreoSir({ description: 'notas mías' })).toBe(false)
    expect(loCreoSir({ description: null })).toBe(false)
    expect(mismoEvento(LARGO, { id: 'x', title: LARGO_HUERFANO, start: '2026-08-07', description: CON_MARCA })).toBe(true)
    expect(mismoEvento(LARGO, { id: 'x', title: LARGO_HUERFANO, start: '2026-08-07' })).toBe(false)
    // La vía original sigue funcionando sin marca ninguna.
    expect(mismoEvento(LARGO, { id: 'x', title: CORTO, start: '2026-08-07' })).toBe(true)
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

  it('adopta por chip cuando los títulos largos divergen, si lo creó SIR', () => {
    const google: EventoGoogleLite[] = [
      { id: 'creado_por_sir', title: LARGO_HUERFANO, start: '2026-08-07', description: CON_MARCA },
    ]
    const admin: EventoAdministrado[] = [{ title: LARGO, date: '2026-08-07', gcalEventId: null }]
    expect(huerfanosParaAdoptar(google, admin)[0]?.gcalEventId).toBe('creado_por_sir')
  })

  it('NO adopta por chip un evento sin la marca: SIR le pisaría el título y la hora', () => {
    const google: EventoGoogleLite[] = [{ id: 'de_aaron', title: LARGO_HUERFANO, start: '2026-08-07' }]
    const admin: EventoAdministrado[] = [{ title: LARGO, date: '2026-08-07', gcalEventId: null }]
    expect(huerfanosParaAdoptar(google, admin)).toHaveLength(0)
  })
})
