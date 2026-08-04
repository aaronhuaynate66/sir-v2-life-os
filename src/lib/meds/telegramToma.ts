// SIR V2 — Marcar una toma desde el aviso de Telegram. PURO.
//
// ═══ POR QUÉ ═════════════════════════════════════════════════════════════════
//
// Aaron, 3-ago-2026: *"un recordatorio de esas medicinas por telegram o
// notificaciones push y el conteo de todas esas medicinas"*.
//
// El recordatorio ya se entrega, pero avisar y contar son cosas distintas: si para
// registrar la toma hay que abrir la app, el conteo va a quedar en cero y el panel va
// a decir "falta la de hoy" para siempre. Es el mismo hueco que tuvo el 👍/👎: se le
// pedía calificar y en Telegram no había botón (#1030).
//
// Acá el aviso trae un botón por medicamento, más uno de "todas". Un tap = una toma.
//
// ═══ EL LÍMITE DE 64 BYTES ═══════════════════════════════════════════════════
//
// `callback_data` de la Bot API topea en 64 bytes. Por eso:
//   · individual → `med:<itemId>`   (los ids son cortos: `presci_maxilo_orfenadrina`)
//   · todas      → `medall:<HHMM>`  (la hora, no la lista: una lista no cabe)
// El handler de "todas" resuelve los ítems por su `schedule`, no por el mensaje: el
// texto del aviso no es una fuente de verdad.

export const MED_CB = 'med:'
export const MED_ALL_CB = 'medall:'

/** Prefijo de los ids de recordatorio que SON una toma de medicación. */
const REM_TOMA = 'rem_med_'

/** Id determinístico del recordatorio de la toma de `fecha` a `hora`. PURA. */
export function remIdDeToma(fecha: string, hora: string): string {
  return `${REM_TOMA}${fecha}_${(hora ?? '').replace(':', '')}`
}

/**
 * ¿Este recordatorio ES una toma de medicación? Devuelve su hora, o null. PURA.
 *
 * ═══ POR QUÉ NO SE DERIVA DE `due_at` ═══
 * El cron decidía si adjuntar botones mirando la HORA del `due_at` de cualquier
 * recordatorio que tuviera `med_prescription_id`. Eso funcionaba de casualidad: el
 * recordatorio de los 5 laboratorios del neurólogo también cuelga de esa receta (es su
 * monitoreo) y si hubiera caído a una hora con medicamentos agendados, el cron le
 * habría REEMPLAZADO el texto por el de la toma — el aviso de los laboratorios habría
 * desaparecido sin dejar rastro.
 *
 * La intención tiene que estar en el id, no adivinarse de la hora.
 */
export function horaDeRecordatorioDeToma(reminderId: string | null | undefined): string | null {
  const s = (reminderId ?? '').trim()
  if (!s.startsWith(REM_TOMA)) return null
  const m = s.slice(REM_TOMA.length).match(/^(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})$/)
  if (!m) return null
  if (Number(m[2]) > 23 || Number(m[3]) > 59) return null
  return `${m[2]}:${m[3]}`
}

/** `med:<itemId>` para el botón de un medicamento. PURA. */
export function medCallbackData(itemId: string): string {
  return `${MED_CB}${itemId}`
}

/** `medall:2200` para "tomé todas las de esta toma". PURA. */
export function medAllCallbackData(hora: string): string {
  return `${MED_ALL_CB}${(hora ?? '').replace(':', '')}`
}

/** Devuelve el itemId si el callback es de un medicamento. null si no. PURA. */
export function parseMedCallback(data: string | null | undefined): string | null {
  const s = (data ?? '').trim()
  if (!s.startsWith(MED_CB)) return null
  const id = s.slice(MED_CB.length).trim()
  return id.length > 0 ? id : null
}

/** Devuelve 'HH:MM' si el callback es el de "todas". null si no. PURA. */
export function parseMedAllCallback(data: string | null | undefined): string | null {
  const s = (data ?? '').trim()
  if (!s.startsWith(MED_ALL_CB)) return null
  const raw = s.slice(MED_ALL_CB.length).trim()
  if (!/^\d{4}$/.test(raw)) return null
  const hh = raw.slice(0, 2)
  const mm = raw.slice(2, 4)
  if (Number(hh) > 23 || Number(mm) > 59) return null
  return `${hh}:${mm}`
}

export interface MedDeToma {
  itemId: string
  medName: string
  dose: string | null
  /** true si YA se registró hoy: el botón cambia de texto y no se ofrece de nuevo. */
  yaHoy: boolean
}

export interface BotonFila {
  text: string
  callbackData: string
}

/**
 * Los botones del aviso: uno por medicamento pendiente + "todas" si hay 2 o más.
 * Los ya tomados se muestran con ✓ y SIN callback nuevo (se manda el mismo, el
 * handler es idempotente) para que Aaron vea el estado y no dude si tocó o no. PURA.
 */
export function botonesDeToma(meds: readonly MedDeToma[], hora: string): BotonFila[][] {
  const lista = (meds ?? []).filter((m) => m?.itemId && m?.medName)
  if (lista.length === 0) return []
  const filas: BotonFila[][] = lista.map((m) => [{
    text: m.yaHoy ? `✓ ${m.medName}` : `✅ ${m.medName}`,
    callbackData: medCallbackData(m.itemId),
  }])
  const pendientes = lista.filter((m) => !m.yaHoy)
  // "Todas" sólo si de verdad ahorra taps: con una sola pendiente es ruido.
  if (pendientes.length >= 2) {
    filas.push([{ text: `✅ Todas (${pendientes.length})`, callbackData: medAllCallbackData(hora) }])
  }
  return filas
}

/** El texto del aviso. PURA. */
export function textoDeToma(meds: readonly MedDeToma[], hora: string): string {
  const lista = (meds ?? []).filter((m) => m?.itemId && m?.medName)
  const pendientes = lista.filter((m) => !m.yaHoy)
  if (pendientes.length === 0) {
    return `💊 ${hora} — ya registraste todo lo de esta toma. 👏`
  }
  const nombres = pendientes.map((m) => `${m.medName}${m.dose ? ` ${m.dose}` : ''}`).join('\n· ')
  return `💊 Toma de las ${hora}\n\n· ${nombres}\n\nToca lo que ya tomaste 👇`
}
