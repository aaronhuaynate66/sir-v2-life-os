// SIR V2 — Tests del sincronizador a Google Calendar.
//
// Nació de: "me hiciste crear toda la integración con Google para tener dónde meter
// los eventos, así que empieza a hacer que funcione" (Aaron, 31-jul-2026). La
// integración estaba conectada; lo único que existía era un push MANUAL por evento
// que nadie llamaba. Su boda del 1-ago llevaba desde el 28-jul sin subir.
import { describe, it, expect } from 'vitest'
import { descripcionParaGoogle, eventoParaGoogle, VENTANA_PASADA_DIAS, MAX_POR_CORRIDA } from './syncPersonalEvents'

// Las notas TAL CUAL están en prod. Si el parseo se rompe, se rompe con estas.
const NOTA_MAXILO =
  'A partir de 4:00 pm · Consultorio C-101 · Clínica San Borja, Av. Guardia Civil 337. Médico: CAMPOS SOTO ALBERTO JOSE. Ticket emitido 30-jul 15:54. LLEVAR: el disco de la tomografía.'

describe('eventoParaGoogle con las notas reales de Aaron', () => {
  // El 3-ago preguntó: "¿cómo es que en mi calendario no me sale la cita del cirujano
  // maxilofacial hoy a las 4?". SIR la calculaba bien — fallaba el PATCH a Google
  // (ver buildGoogleEventPatchPayload). Estos tests fijan el lado de SIR.
  it('la cirugía del 3-ago sale cronometrada a las 16:00 aunque la fila diga all_day', () => {
    const ev = eventoParaGoogle({
      id: 'pe_maxilofacial_20260730',
      title: 'Cirugía Maxilofacial — Dr. Campos Soto (control del trauma del 27-jul)',
      event_date: '2026-08-03',
      end_date: null,
      all_day: true, // ← la fila miente; la hora de la nota manda
      note: NOTA_MAXILO,
      gcal_event_id: '8nlhvh6h7gj0jc197fkls7rmb8',
    })
    expect(ev.allDay).toBe(false)
    expect(ev.start).toBe('2026-08-03T16:00:00-05:00')
    expect(ev.end).toBe('2026-08-03T17:00:00-05:00')
  })

  it('sin hora en la nota se queda de día completo, que es lo honesto', () => {
    const ev = eventoParaGoogle({
      id: 'pe_limite',
      title: 'LÍMITE: certificado médico deportivo para el Mundial',
      event_date: '2026-08-10',
      end_date: null,
      all_day: true,
      note: 'Obtener y subir el certificado médico deportivo actualizado.',
      gcal_event_id: null,
    })
    expect(ev.allDay).toBe(true)
    expect(ev.start).toBe('2026-08-10')
  })
})

describe('descripcionParaGoogle', () => {
  it('manda la nota COMPLETA: es el valor real del evento', () => {
    // La nota de la cita del maxilofacial trae la lista de qué pedir. Recortarla
    // sería quitarle justo lo útil cuando abre el evento en el celular.
    const larga = 'A partir de 4:00 pm · Consultorio C-101. PEDIR: (1) rinoscopio; (2) coronal de hueso; (3) ATM; (4) SCOAT6.'
    const d = descripcionParaGoogle(larga)!
    expect(d).toContain('SCOAT6')
    expect(d).toContain('Consultorio C-101')
  })

  it('firma el evento para distinguirlo de los que él crea a mano en Google', () => {
    expect(descripcionParaGoogle('algo')).toContain('cargado por SIR')
  })

  it('undefined si no hay nota — no manda una descripción vacía', () => {
    expect(descripcionParaGoogle(null)).toBeUndefined()
    expect(descripcionParaGoogle('')).toBeUndefined()
    expect(descripcionParaGoogle('   ')).toBeUndefined()
  })
})

describe('constantes declaradas', () => {
  it('sube también lo de los últimos días, no solo el futuro', () => {
    // Un evento de ayer sigue siendo historia útil en el calendario.
    expect(VENTANA_PASADA_DIAS).toBe(7)
  })
  it('tiene tope por corrida: es un cron, no un backfill infinito', () => {
    expect(MAX_POR_CORRIDA).toBe(60)
  })
})
