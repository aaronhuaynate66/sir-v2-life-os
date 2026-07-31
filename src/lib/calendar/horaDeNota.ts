// SIR V2 — La HORA que está escrita en la nota → evento cronometrado. PURO.
//
// ═══ POR QUÉ ═════════════════════════════════════════════════════════════════
//
// Aaron, 31-jul-2026, con una captura de su Google Calendar: *"mira cómo se ve en el
// calendario la agenda de la hora, no quiero ni imaginar cómo se ve dentro del
// calendario de SIR"*.
//
// Y tenía razón. Los eventos se subían **todos como "todo el día"**, porque
// `personal_events.event_date` es un DATE sin hora. Resultado: su cita del
// maxilofacial de las **4:00 pm** y su examen del IPD de las **8:10 am** aparecían
// como banderitas en la franja de arriba, y el calendario no podía mostrarle en qué
// momento del día caían. La hora existía… enterrada en el texto de la nota.
//
// Peor: como "todo el día", Google le pone el recordatorio por defecto a las 23:30
// del día anterior. Para un examen de 8:10 am con ayuno eso es inútil.
//
// La capa de Google YA soportaba eventos cronometrados (`dateTime` + `timeZone`,
// default America/Lima) y recurrencia anual. Simplemente no se estaba usando.
//
// PURO: cero red, cero DB.

/** Perú no tiene horario de verano: el offset es fijo. */
export const LIMA_OFFSET = '-05:00'

export interface RangoHorario {
  /** ISO con offset de Lima, listo para `dateTime` de Google. */
  startISO: string
  /** Fin. Si la nota traía rango se respeta; si no, +1 h. */
  endISO: string
}

function iso(fecha: string, h: number, m: number): string {
  return `${fecha}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00${LIMA_OFFSET}`
}

/** Suma minutos a un (h,m) y devuelve el ISO del mismo día (tope 23:59). */
function mas(fecha: string, h: number, m: number, minutos: number): string {
  const total = Math.min(h * 60 + m + minutos, 23 * 60 + 59)
  return iso(fecha, Math.floor(total / 60), total % 60)
}

/**
 * Interpreta la hora escrita en prosa. PURA. null si no hay ninguna.
 *
 * Formatos REALES vistos en sus notas:
 *   "18:00–20:00. Ya pagada."            → rango
 *   "A partir de 4:00 pm, Consultorio…"  → 12 h con meridiano
 *   "8:10 am · LLEGAR 8:00 · Puerta 2"   → toma 8:10, no 8:00 (la primera gana)
 *   "14:00 · voy con Diana · Jirón…"     → 24 h
 *   "08:00 - 22:00 los dos días"         → rango con guion corto
 *
 * Sobre el meridiano: si dice pm y la hora es <12, se suman 12. Si NO hay meridiano
 * y la hora es 1-6, se asume **tarde** (nadie agenda una cita a la 1 am) — ese es el
 * único supuesto y queda declarado acá.
 */
/**
 * Cuántos caracteres del principio de la nota se consideran "la hora del evento".
 *
 * La convención al escribir estas notas es arrancar con la hora ("8:10 am · LLEGAR
 * 8:00", "18:00–20:00. Ya pagada", "A partir de 4:00 pm · Consultorio"). Una hora que
 * aparece más adelante, en medio de la prosa, casi siempre es de OTRO evento.
 *
 * Caso real que lo motivó: la nota del briefing del Mundial dice "…Mismo día que la
 * ceremonia de apertura (18:00-20:00)" — esa hora es de la ceremonia, no del briefing,
 * y el parser se la estaba llevando.
 */
const VENTANA_INICIAL = 60

/**
 * Palabras que, justo antes de la hora, indican que la hora es de OTRO DÍA.
 *
 * Caso real: "Hoy, para el examen **de mañana** 8:10 am: (1) imprimir el Anexo 2…" —
 * es la tarea de PREPARACIÓN del día 6, y las 8:10 son del examen del día 7. Sin esto
 * la preparación quedaba agendada a las 8:10 del 6.
 */
const OTRO_DIA = /(mañana|ayer|pasado\s+mañana|el\s+(?:lunes|martes|miércoles|jueves|viernes|sábado|domingo))\D{0,12}$/i

export function rangoHorarioDeNota(fecha: string, note: string | null | undefined): RangoHorario | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? '')) return null
  const s = (note ?? '').trim()
  if (!s) return null

  /** ¿La hora encontrada en `idx` es de ESTE evento? */
  const esDeEsteEvento = (idx: number): boolean => {
    if (idx > VENTANA_INICIAL) return false
    return !OTRO_DIA.test(s.slice(0, idx))
  }

  // 1) Rango explícito: "18:00–20:00", "08:00 - 22:00".
  const rango = s.match(/(\d{1,2}):(\d{2})\s*(?:[–\-—]|\ba\b)\s*(\d{1,2}):(\d{2})/)
  if (rango && esDeEsteEvento(rango.index ?? 0)) {
    const [h1, m1, h2, m2] = [Number(rango[1]), Number(rango[2]), Number(rango[3]), Number(rango[4])]
    if (validas(h1, m1) && validas(h2, m2)) {
      const ini = iso(fecha, h1, m1)
      const fin = iso(fecha, h2, m2)
      return { startISO: ini, endISO: fin > ini ? fin : mas(fecha, h1, m1, 60) }
    }
  }

  // 2) Hora con meridiano: "4:00 pm", "8:10 a.m.".
  const mer = s.match(/(\d{1,2}):(\d{2})\s*([ap])\.?\s?m\.?/i)
  if (mer && esDeEsteEvento(mer.index ?? 0)) {
    let h = Number(mer[1])
    const m = Number(mer[2])
    const pm = mer[3].toLowerCase() === 'p'
    if (pm && h < 12) h += 12
    if (!pm && h === 12) h = 0
    if (validas(h, m)) return { startISO: iso(fecha, h, m), endISO: mas(fecha, h, m, 60) }
  }

  // 3) Hora suelta: la PRIMERA que aparezca. En "8:10am. LLEGAR 8:00" la primera es
  //    la de la cita; la segunda es la instrucción de llegar antes.
  const suelta = s.match(/(?:^|[\s·(])(\d{1,2}):(\d{2})(?=$|[\s·).,])/)
  if (suelta && esDeEsteEvento(suelta.index ?? 0)) {
    let h = Number(suelta[1])
    const m = Number(suelta[2])
    // Sin meridiano y entre 1 y 6 → se asume tarde. Único supuesto del módulo.
    if (h >= 1 && h <= 6) h += 12
    if (validas(h, m)) return { startISO: iso(fecha, h, m), endISO: mas(fecha, h, m, 60) }
  }
  return null
}

function validas(h: number, m: number): boolean {
  return Number.isInteger(h) && Number.isInteger(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59
}

/**
 * Título corto para el chip del calendario. PURO.
 *
 * En la captura de Aaron los títulos salían cortados ("Examen médico EPP — IF…").
 * Google muestra ~28 caracteres en la vista semanal, así que el título tiene que
 * decir lo esencial ahí y el resto vive en la descripción — que es donde él ya
 * encontró la lista de qué pedir.
 *
 * Corta en el separador natural (·, —, () antes de recortar a lo bruto.
 */
export function tituloCorto(titulo: string, max = 42): string {
  const t = (titulo ?? '').trim()
  if (t.length <= max) return t
  for (const sep of [' — ', ' · ', ' (']) {
    const i = t.indexOf(sep)
    if (i > 8 && i <= max) return t.slice(0, i).trim()
  }
  return `${t.slice(0, max - 1).trimEnd()}…`
}
