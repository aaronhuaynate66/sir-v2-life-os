// SIR V2 — Tipos del calendario (Outlook .ics).
//
// Un evento ya NORMALIZADO: tiempos en ISO UTC (o date-only si es all-day),
// listos para mostrar en TZ Lima por la UI. El parser (ics.ts) produce estos
// objetos; el feed (feed.ts) los filtra a la ventana próxima.

export interface CalendarEvent {
  /** UID del VEVENT (estable). Para recurrentes, se sufija con el inicio. */
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
}

/** Resultado de leer el feed: degrada limpio si no está configurado. */
export interface CalendarFeedResult {
  /** false = OUTLOOK_ICS_URL no seteada → UI muestra cómo activarlo. */
  configured: boolean
  events: CalendarEvent[]
  /** Mensaje si el fetch/parse falló (configurado pero no se pudo leer). */
  error?: string
  /** ISO del momento en que se generó (para mostrar "actualizado hace…"). */
  fetchedAt?: string
}
