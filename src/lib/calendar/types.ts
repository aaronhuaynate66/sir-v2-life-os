// SIR V2 — Tipos del calendario (Outlook .ics).
//
// Un evento ya NORMALIZADO: tiempos en ISO UTC (o date-only si es all-day),
// listos para mostrar en TZ Lima por la UI. El parser (ics.ts) produce estos
// objetos; el feed (feed.ts) los filtra a la ventana próxima.

export interface CalendarEvent {
  /** UID del VEVENT (estable). Para recurrentes, se sufija con el inicio.
   *  En modo multi-calendario se prefija con el id de la conexión para que sea
   *  único entre feeds distintos. */
  id: string
  /** UID original del VEVENT (compartido por todas las ocurrencias). */
  uid: string
  title: string
  /**
   * Inicio. Si allDay: 'YYYY-MM-DD'. Si no: ISO UTC ('...Z').
   */
  start: string
  /** Fin (mismo formato que start). Puede faltar. */
  end?: string
  allDay: boolean
  location?: string
  /** true si la ocurrencia salió de expandir una RRULE. */
  recurring: boolean
  /** Id de la conexión de la que salió (multi-calendario). 'env' para el fallback. */
  calendarId?: string
  /** Label del calendario de origen (ej. "Trabajo"). */
  calendarLabel?: string
  /** Color del calendario de origen (hex), para el indicador en la UI. */
  calendarColor?: string
}

/** Resumen de un calendario presente en el resultado, para leyenda/diagnóstico. */
export interface CalendarSummary {
  id: string
  label: string
  color?: string
  /** Mensaje si ESTE feed falló (los demás pueden haber andado bien). */
  error?: string
}

/** Resultado de leer el/los feed(s): degrada limpio si no hay nada configurado. */
export interface CalendarFeedResult {
  /** false = sin conexiones y sin OUTLOOK_ICS_URL → UI muestra cómo activarlo. */
  configured: boolean
  events: CalendarEvent[]
  /** Calendarios incluidos (para leyenda de colores y errores por-feed). */
  calendars?: CalendarSummary[]
  /** Mensaje si el fetch/parse falló de forma global. */
  error?: string
  /** ISO del momento en que se generó (para mostrar "actualizado hace…"). */
  fetchedAt?: string
}

// ─── Conexiones de calendario (multi-calendario, Calendar v2 Fase 1) ──

/** Conexión tal como la ve el cliente (dueño). El ics_url es del usuario:
 *  se devuelve para que pueda editarlo, pero NUNCA se loguea. */
export interface CalendarConnectionDto {
  id: string
  label: string
  /** 'ics' hoy; abierto a 'google'/'outlook' (OAuth, Fase 2). */
  provider: string
  /** URL .ics (puede ser null en conexiones OAuth futuras). */
  icsUrl: string | null
  /** Color hex elegido para el calendario. */
  color: string | null
  enabled: boolean
  createdAt: string
}

/** Paleta de colores para calendarios (legible sobre el tema oscuro). El
 *  primero (marca) es el default. */
export const CALENDAR_COLORS: readonly string[] = [
  '#7c5cff', // brand (violeta)
  '#3b82f6', // azul
  '#22c55e', // verde
  '#f59e0b', // ámbar
  '#ef4444', // rojo
  '#ec4899', // rosa
  '#06b6d4', // cian
  '#94a3b8', // gris
] as const

export const DEFAULT_CALENDAR_COLOR = CALENDAR_COLORS[0]
