// SIR V2 — Calendario comercial de Perú (dataset estático EDITABLE).
//
// Fechas con peso comercial que un negocio en Perú (Marlab, retail, boticas)
// quiere anticipar para activar campañas. NO son fechas personales: alimentan
// los "recordatorios por rubro" del motor proactivo (lib/proactive/roleDates)
// para el rol comercial.
//
// Es un dataset LOCAL a propósito (no DB): son fechas culturales estables, y
// tenerlas en código las hace editables en un PR sin migración ni panel. Si
// mañana hay que sumar el "Cyber Wow" o un evento propio, se agrega una fila acá.
//
// Cada evento sabe calcular su PRÓXIMA ocurrencia (este año o el siguiente):
//   - fixed     : mes/día fijos (San Valentín, Fiestas Patrias, Navidad).
//   - nthWeekday: n-ésimo día-de-semana del mes (Día de la Madre = 2° domingo
//                 de mayo; Black Friday = 4° viernes de noviembre).
//
// PURO + determinístico: recibe `now` explícito (default new Date()) y trabaja
// en TZ LOCAL (componentes locales del Date), igual que el resto de utils de
// fecha del proyecto → tests TZ-independientes.

const DAY_MS = 86_400_000

/** Cómo se ubica la fecha en el calendario de un año dado. */
export type CommercialDateSpec =
  | { type: 'fixed'; month: number; day: number } // month 0-11
  | { type: 'nthWeekday'; month: number; weekday: number; n: number } // weekday 0=dom

/** Una fecha del calendario comercial. */
export interface CommercialEvent {
  /** Id estable (para keys + dedupe). */
  id: string
  /** Nombre para UI ("Día de la Madre", "Black Friday"). */
  label: string
  spec: CommercialDateSpec
  /** Días de anticipación con que conviene empezar a prepararla (lead time de
   *  campaña). El evento sólo se surfacéa cuando faltan <= leadDays. */
  leadDays: number
  /** Sugerencia accionable corta, ligada a la naturaleza del evento. Puede
   *  combinarse con un objetivo comercial concreto en roleDates. */
  hint: string
}

/**
 * Calendario comercial de Perú. Editable: agregar/quitar filas acá.
 * Ordenado por mes para lectura humana (el orden no afecta el cómputo).
 */
export const PERU_COMMERCIAL_CALENDAR: CommercialEvent[] = [
  {
    id: 'san_valentin',
    label: 'San Valentín',
    spec: { type: 'fixed', month: 1, day: 14 },
    leadDays: 21,
    hint: 'Campaña de regalo / promo de pareja',
  },
  {
    id: 'dia_mujer',
    label: 'Día de la Mujer',
    spec: { type: 'fixed', month: 2, day: 8 },
    leadDays: 14,
    hint: 'Mensaje de marca con propósito',
  },
  {
    id: 'dia_madre',
    label: 'Día de la Madre',
    spec: { type: 'nthWeekday', month: 4, weekday: 0, n: 2 }, // 2° domingo de mayo
    leadDays: 35,
    hint: 'Campaña fuerte de regalo — empezá temprano',
  },
  {
    id: 'dia_padre',
    label: 'Día del Padre',
    spec: { type: 'nthWeekday', month: 5, weekday: 0, n: 3 }, // 3er domingo de junio
    leadDays: 30,
    hint: 'Campaña de regalo para papá',
  },
  {
    id: 'fiestas_patrias',
    label: 'Fiestas Patrias',
    spec: { type: 'fixed', month: 6, day: 28 },
    leadDays: 30,
    hint: 'Promo "28 de julio" / descuentos patrios',
  },
  {
    id: 'black_friday',
    label: 'Black Friday',
    spec: { type: 'nthWeekday', month: 10, weekday: 5, n: 4 }, // 4° viernes de noviembre
    leadDays: 35,
    hint: 'Tu mayor pico de ventas — ofertas y stock listos',
  },
  {
    id: 'navidad',
    label: 'Navidad',
    spec: { type: 'fixed', month: 11, day: 25 },
    leadDays: 45,
    hint: 'Campaña de temporada / canastas y regalos',
  },
]

/** medianoche local de hoy (a partir de `now`). */
function startOfDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/** Fecha del n-ésimo `weekday` del mes (year, month). weekday 0=domingo.
 *  n=1 → primero, n=2 → segundo, etc. */
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month, 1)
  const offset = (weekday - first.getDay() + 7) % 7
  return new Date(year, month, 1 + offset + (n - 1) * 7)
}

/** Ocurrencia del evento en un año concreto (medianoche local). */
function occurrenceInYear(spec: CommercialDateSpec, year: number): Date {
  if (spec.type === 'fixed') return new Date(year, spec.month, spec.day)
  return nthWeekdayOfMonth(year, spec.month, spec.weekday, spec.n)
}

export interface CommercialOccurrence {
  /** Fecha de la próxima ocurrencia (medianoche local). */
  date: Date
  /** Días enteros hasta la fecha (0 = hoy, >0 futuro). Nunca negativo: siempre
   *  devolvemos la PRÓXIMA ocurrencia. */
  daysUntil: number
}

/**
 * Próxima ocurrencia de un evento comercial >= hoy. Si la de este año ya pasó,
 * devuelve la del año siguiente. PURA.
 */
export function nextCommercialOccurrence(
  spec: CommercialDateSpec,
  now: Date = new Date(),
): CommercialOccurrence {
  const today = startOfDay(now)
  let date = occurrenceInYear(spec, today.getFullYear())
  if (date.getTime() < today.getTime()) {
    date = occurrenceInYear(spec, today.getFullYear() + 1)
  }
  const daysUntil = Math.round((date.getTime() - today.getTime()) / DAY_MS)
  return { date, daysUntil }
}
