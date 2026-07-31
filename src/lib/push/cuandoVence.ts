// SIR V2 — "es mañana a las 8:10": cuándo vence un recordatorio, en palabras. PURO.
//
// ═══ POR QUÉ ═════════════════════════════════════════════════════════════════
//
// El cron de recordatorios pasó a mirar 36 h hacia adelante, porque avisar `due_at
// <= now` con un cron diario llegaba hasta 23 h TARDE (ver `cron/reminders-due`).
// Caso real: el examen del IPD del 7-ago 8:10 am se iba a avisar el 8-ago.
//
// Pero adelantar el aviso crea un problema nuevo: es UNA sola notificación, y el
// texto del recordatorio dice "8:10am" sin decir de qué día. Leído un día antes, "⏰
// Recordatorio: Examen médico 8:10am" se entiende como si fuera hoy — y en este caso
// eso significa no ayunar la noche anterior ni imprimir el Anexo 2.
//
// Así que el aviso tiene que decir el CUÁNDO por delante.

/** Zona de Lima: offset fijo (Perú no tiene horario de verano). */
const LIMA_OFFSET_MS = 5 * 3_600_000
const DAY = 86_400_000

/** 'YYYY-MM-DD' del instante, en hora de Lima. PURA. */
function diaLima(ms: number): string {
  return new Date(ms - LIMA_OFFSET_MS).toISOString().slice(0, 10)
}

/** 'H:MM am/pm' en hora de Lima. PURA. */
export function horaLima(ms: number): string {
  const d = new Date(ms - LIMA_OFFSET_MS)
  const h24 = d.getUTCHours()
  const min = String(d.getUTCMinutes()).padStart(2, '0')
  const suf = h24 < 12 ? 'am' : 'pm'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${min} ${suf}`
}

/**
 * Prefijo temporal para el aviso, o null si es HOY y no hace falta aclararlo.
 * PURA — el "ahora" se inyecta.
 *
 * Devuelve 'mañana', 'pasado mañana' o 'el <día>' según cuántos días de calendario
 * (en Lima) faltan. Se compara por DÍA DE CALENDARIO y no por horas: un recordatorio
 * a 20 h de distancia puede ser "mañana temprano" o "hoy en la noche", y lo que
 * importa para actuar es la fecha, no la resta.
 */
export function prefijoDeVencimiento(dueAtIso: string | null | undefined, nowMs: number): string | null {
  const t = Date.parse(dueAtIso ?? '')
  if (!Number.isFinite(t)) return null
  const dHoy = diaLima(nowMs)
  const dDue = diaLima(t)
  if (dDue === dHoy) return null
  const dias = Math.round((Date.parse(`${dDue}T00:00:00Z`) - Date.parse(`${dHoy}T00:00:00Z`)) / DAY)
  if (dias < 0) return null // ya pasó: el texto del recordatorio manda
  if (dias === 1) return 'mañana'
  if (dias === 2) return 'pasado mañana'
  const nombres = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  return `el ${nombres[new Date(`${dDue}T12:00:00Z`).getUTCDay()]}`
}

/**
 * El texto final del aviso de Telegram. PURA.
 *
 * Antepone el cuándo y la hora cuando el recordatorio NO es de hoy. Si es de hoy (o
 * la fecha no parsea) devuelve el texto tal cual: agregar "hoy" a algo que ya se
 * entiende es ruido.
 */
export function textoRecordatorio(
  texto: string,
  dueAtIso: string | null | undefined,
  nowMs: number,
): string {
  const base = (texto ?? '').trim()
  const pref = prefijoDeVencimiento(dueAtIso, nowMs)
  if (!pref) return base
  const t = Date.parse(dueAtIso ?? '')
  const hora = Number.isFinite(t) ? ` ${horaLima(t)}` : ''
  return `ES ${pref.toUpperCase()}${hora} — ${base}`
}
