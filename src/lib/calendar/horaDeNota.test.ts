// SIR V2 — Tests del parser de hora en la nota.
//
// Aaron mandó una captura de su Google Calendar: sus eventos eran banderitas de "todo
// el día" y no se veía a qué hora caían. La cita del maxilofacial (4:00 pm) y el
// examen del IPD (8:10 am) tenían la hora enterrada en el texto de la nota.
import { describe, it, expect } from 'vitest'
import { rangoHorarioDeNota, tituloCorto, LIMA_OFFSET } from './horaDeNota'

const D = '2026-08-03'

describe('rangoHorarioDeNota — las notas REALES de Aaron', () => {
  it('la cita del maxilofacial: "A partir de 4:00 pm" → 16:00', () => {
    const r = rangoHorarioDeNota(D, 'A partir de 4:00 pm · Consultorio C-101 · Clínica San Borja')!
    expect(r.startISO).toBe(`2026-08-03T16:00:00${LIMA_OFFSET}`)
    expect(r.endISO).toBe(`2026-08-03T17:00:00${LIMA_OFFSET}`)
  })

  it('el examen del IPD: toma 8:10 (la cita) y NO 8:00 (la instrucción de llegar)', () => {
    const r = rangoHorarioDeNota('2026-08-07', '8:10 am · LLEGAR 8:00 · Puerta 2 o 13, IPD San Luis. AYUNO DE 8 HORAS')!
    expect(r.startISO).toBe(`2026-08-07T08:10:00${LIMA_OFFSET}`)
  })

  it('la boda: rango "18:00–20:00" se respeta entero', () => {
    const r = rangoHorarioDeNota('2026-08-01', '18:00–20:00. YA PAGADA dentro de la inscripción.')!
    expect(r.startISO).toBe(`2026-08-01T18:00:00${LIMA_OFFSET}`)
    expect(r.endISO).toBe(`2026-08-01T20:00:00${LIMA_OFFSET}`)
  })

  it('el Taekwondo: rango con guion corto "08:00 - 22:00"', () => {
    const r = rangoHorarioDeNota('2026-11-06', 'Dhahran Expo · 08:00 - 22:00 los dos días')!
    expect(r.startISO).toContain('T08:00:00')
    expect(r.endISO).toContain('T22:00:00')
  })

  it('24 h suelta: "14:00 · voy con Diana"', () => {
    const r = rangoHorarioDeNota(D, '14:00 · voy con Diana · Jirón Pedro Solari 242')!
    expect(r.startISO).toBe(`2026-08-03T14:00:00${LIMA_OFFSET}`)
  })
})

describe('rangoHorarioDeNota — supuestos y bordes', () => {
  it('sin meridiano y entre 1 y 6 asume TARDE (nadie agenda a la 1 am)', () => {
    const r = rangoHorarioDeNota(D, 'Reunión 3:30 en la oficina')!
    expect(r.startISO).toBe(`2026-08-03T15:30:00${LIMA_OFFSET}`)
  })

  it('12:00 am es medianoche, 12:00 pm es mediodía', () => {
    expect(rangoHorarioDeNota(D, 'a las 12:00 am')!.startISO).toContain('T00:00:00')
    expect(rangoHorarioDeNota(D, 'a las 12:00 pm')!.startISO).toContain('T12:00:00')
  })

  it('un rango invertido no genera un fin anterior al inicio', () => {
    const r = rangoHorarioDeNota(D, '20:00–18:00 (mal escrito)')!
    expect(r.endISO > r.startISO).toBe(true)
  })

  it('usa el offset de Lima, no UTC', () => {
    expect(rangoHorarioDeNota(D, '10:00')!.startISO.endsWith('-05:00')).toBe(true)
  })

  it('null cuando no hay hora → el evento sigue siendo de todo el día', () => {
    expect(rangoHorarioDeNota(D, 'Segundo momento compartido en 8 días')).toBeNull()
    expect(rangoHorarioDeNota(D, null)).toBeNull()
    expect(rangoHorarioDeNota(D, '')).toBeNull()
    expect(rangoHorarioDeNota('no-es-fecha', '10:00')).toBeNull()
  })

  it('no confunde una fecha ni una hora imposible con la hora del evento', () => {
    expect(rangoHorarioDeNota(D, 'Cargado a mano el 28-jul')).toBeNull()
    expect(rangoHorarioDeNota(D, 'código 99:99')).toBeNull()
  })
})

describe('tituloCorto — el chip del calendario se cortaba', () => {
  it('corta en el separador natural, no a la mitad de una palabra', () => {
    expect(tituloCorto('Cirugía Maxilofacial — Dr. Campos Soto (control del trauma del 27-jul)'))
      .toBe('Cirugía Maxilofacial')
    expect(tituloCorto('Examen médico EPP — IPD San Luis · 8:10 am (paso al Mundial)'))
      .toBe('Examen médico EPP')
  })
  it('lo que ya es corto no se toca', () => {
    expect(tituloCorto('Aniversario con Diana')).toBe('Aniversario con Diana')
  })
  it('sin separador, recorta con puntos suspensivos', () => {
    const largo = 'a'.repeat(60)
    expect(tituloCorto(largo)).toHaveLength(42)
    expect(tituloCorto(largo).endsWith('…')).toBe(true)
  })
})

describe('la hora que NO es de este evento (casos reales, cazados en vivo)', () => {
  it('"para el examen de mañana 8:10 am" → la preparación NO se agenda a las 8:10', () => {
    // Evento del 6-ago: preparar el examen del 7. Las 8:10 son del examen, no de esto.
    const nota = 'Hoy, para el examen de mañana 8:10 am: (1) imprimir el Anexo 2; (2) llenar el formulario'
    expect(rangoHorarioDeNota('2026-08-06', nota)).toBeNull()
  })

  it('una hora citada al final de la prosa es de OTRO evento', () => {
    // Nota del briefing: la hora entre paréntesis es de la ceremonia de apertura.
    const nota = 'Asistir al briefing técnico oficial y hacer reconocimiento del circuito con ensayo ligero. Mismo día que la ceremonia de apertura (18:00-20:00).'
    expect(rangoHorarioDeNota('2026-11-05', nota)).toBeNull()
  })

  it('pero la hora al PRINCIPIO sí es del evento', () => {
    expect(rangoHorarioDeNota('2026-11-05', '18:00–20:00. Ya pagada dentro de la inscripción.')).not.toBeNull()
  })
})
