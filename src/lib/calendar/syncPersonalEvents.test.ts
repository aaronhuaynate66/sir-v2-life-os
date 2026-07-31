// SIR V2 — Tests del sincronizador a Google Calendar.
//
// Nació de: "me hiciste crear toda la integración con Google para tener dónde meter
// los eventos, así que empieza a hacer que funcione" (Aaron, 31-jul-2026). La
// integración estaba conectada; lo único que existía era un push MANUAL por evento
// que nadie llamaba. Su boda del 1-ago llevaba desde el 28-jul sin subir.
import { describe, it, expect } from 'vitest'
import { descripcionParaGoogle, VENTANA_PASADA_DIAS, MAX_POR_CORRIDA } from './syncPersonalEvents'

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
