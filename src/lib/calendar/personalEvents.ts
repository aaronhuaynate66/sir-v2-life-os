// SIR V2 — `personal_events` → eventos del calendario unificado. PURO.
//
// ═══ EL BUG, Y ES ESTRUCTURAL ════════════════════════════════════════════════
//
// Aaron, 31-jul-2026: *"¿por qué sigo sin ver en mi calendario el matrimonio de
// Laura?"* — y ya lo había preguntado el 30-jul, cuando se arregló que el BRIEF lo
// nombrara (#1033). El brief quedó bien. **La vista de calendario no.**
//
// `/horario` (su cockpit de calendario, donde /agenda redirige) llama a
// `/api/calendar`, y esa ruta lee **solo feeds .ics externos**: las conexiones de
// `calendar_connections` o el fallback `OUTLOOK_ICS_URL`. **NUNCA lee
// `personal_events`.** O sea que todo lo que se carga dentro de SIR —una boda, una
// cita médica, un descanso indicado por la clínica— es **invisible en su calendario
// por diseño**, no por un retraso de sincronización.
//
// La única vía existente para que apareciera era `/api/personal-events/[id]/
// push-to-google`: una acción MANUAL, evento por evento, que nadie corrió. Por eso
// la boda del 1-ago tenía `gcal_event_id: null` cargada desde el 28-jul.
//
// Es el mismo patrón que apareció seis veces el 31-jul: **SIR tiene el dato y la
// superficie no lo lee.** Y acá con un agravante: se dio por resuelto el reclamo
// arreglando UNA superficie (el brief) sin verificar la que él nombró (el calendario).
//
// PURO: cero red, cero DB. Las filas se inyectan.

import type { CalendarEvent } from './types'

/** Fila de `personal_events` tal como viene de PostgREST. */
export interface PersonalEventRow {
  id: string
  title: string | null
  event_date: string | null
  end_date: string | null
  all_day: boolean | null
  note: string | null
  source: string | null
  /** Nombre de la persona asociada, ya resuelto por quien llama. */
  personName?: string | null
}

/** Id de calendario sintético para los eventos propios de SIR. */
export const SIR_CALENDAR_ID = 'sir-personal'
export const SIR_CALENDAR_LABEL = 'SIR'

/**
 * Convierte filas de `personal_events` en `CalendarEvent[]`. PURA.
 *
 * Decisiones que importan:
 *  · `allDay` por defecto TRUE. La tabla guarda `event_date` como DATE (sin hora),
 *    así que inventar una hora sería mentir. Cuando el evento SÍ tiene hora, vive en
 *    la nota ("18:00–20:00") y ahí se queda: no se parsea prosa para fabricar un
 *    timestamp.
 *  · El nombre de la persona va al título ("Boda religiosa de Laura Alfaro"), porque
 *    en un calendario el "con quién" es la mitad del evento.
 *  · Se filtran filas sin título o sin fecha: una fila a medio cargar no debe pintar
 *    un evento fantasma.
 */
export function personalEventsToCalendar(rows: readonly PersonalEventRow[]): CalendarEvent[] {
  const out: CalendarEvent[] = []
  for (const r of rows ?? []) {
    const title = (r?.title ?? '').trim()
    const date = (r?.event_date ?? '').slice(0, 10)
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    const end = (r.end_date ?? '').slice(0, 10)
    const conPersona = r.personName?.trim() && !title.toLowerCase().includes(r.personName.trim().toLowerCase().split(/\s+/)[0])
      ? `${title} (${r.personName.trim()})`
      : title
    // La HORA se rescata de la nota al título. `CalendarEvent` no tiene campo de
    // descripción, y en un calendario "a las 4" es la mitad del evento: la cita del
    // maxilofacial a las 16:00 y la boda a las 18:00 son inútiles como "todo el día".
    const hora = horaDeLaNota(r.note)
    const conHora = hora ? `${conPersona} · ${hora}` : conPersona
    out.push({
      id: `sir:${r.id}`,
      uid: r.id,
      title: conHora,
      start: date,
      ...(/^\d{4}-\d{2}-\d{2}$/.test(end) && end >= date ? { end } : {}),
      allDay: r.all_day !== false,
      ...(lugarDeLaNota(r.note) ? { location: lugarDeLaNota(r.note) as string } : {}),
      recurring: false,
      calendarId: SIR_CALENDAR_ID,
      calendarLabel: SIR_CALENDAR_LABEL,
    })
  }
  return out
}

/**
 * Fusiona los eventos de SIR con los de los feeds externos. PURA.
 *
 * DEDUPE contra el doble conteo: si un evento propio YA se empujó a Google
 * (`gcal_event_id`), el feed externo lo va a traer también y aparecería dos veces.
 * Se descarta el de SIR cuando hay uno externo el MISMO día con título equivalente
 * — se compara normalizado (sin tildes, sin mayúsculas, sin puntuación) porque
 * Google recorta y reescribe títulos.
 */
export function mergeCalendarEvents(
  externos: readonly CalendarEvent[],
  propios: readonly CalendarEvent[],
  limit?: number,
): CalendarEvent[] {
  const clave = (e: CalendarEvent) => `${(e.start ?? '').slice(0, 10)}|${norm(e.title)}`
  const yaEstan = new Set((externos ?? []).map(clave))
  const nuevos = (propios ?? []).filter((e) => !yaEstan.has(clave(e)))
  const todos = [...(externos ?? []), ...nuevos]
  todos.sort((a, b) => (a.start ?? '').localeCompare(b.start ?? '') || a.title.localeCompare(b.title))
  return typeof limit === 'number' && limit > 0 ? todos.slice(0, limit) : todos
}

/**
 * Rescata la hora escrita en la nota. PURA. null si no hay.
 *
 * Las notas las escribe gente (o SIR) en prosa, y las horas aparecen como "18:00",
 * "18:00–20:00", "14:00 ·", "4:00 pm", "a partir de 4:00 pm". Se devuelve tal cual
 * se escribió, normalizando solo el separador de rango: reformatearla sería
 * arriesgarse a cambiar el dato.
 */
export function horaDeLaNota(note: string | null | undefined): string | null {
  const s = (note ?? '').trim()
  if (!s) return null
  // Rango primero: si hay "18:00–20:00" no queremos quedarnos solo con "18:00".
  const rango = s.match(/(\d{1,2}:\d{2})\s*(?:[–\-—]|a)\s*(\d{1,2}:\d{2})/)
  if (rango) return `${rango[1]}–${rango[2]}`
  const conMeridiano = s.match(/(\d{1,2}:\d{2})\s*([ap])\.?\s?m\.?/i)
  if (conMeridiano) return `${conMeridiano[1]} ${conMeridiano[2].toLowerCase()}m`
  const simple = s.match(/(?:^|[\s·(])(\d{1,2}:\d{2})(?=$|[\s·).,])/)
  return simple ? simple[1] : null
}

/**
 * Rescata una dirección de la nota, si parece haber una. PURA. null si no.
 *
 * Deliberadamente CONSERVADOR: solo cuando hay una marca clara de vía (Av., Jr.,
 * Calle, Jirón…). Volcar la nota entera en `location` llenaría el calendario de
 * prosa — la nota completa se lee en la ficha del evento, no acá.
 */
export function lugarDeLaNota(note: string | null | undefined): string | null {
  const s = (note ?? '').trim()
  if (!s) return null
  const m = s.match(/((?:Av\.|Avenida|Jr\.|Jir[oó]n|Calle|Ca\.|Pasaje|Psje\.|Urb\.)\s[^.·|]{3,80})/i)
  return m ? m[1].trim() : null
}

function norm(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
