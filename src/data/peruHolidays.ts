// SIR V2 — Feriados nacionales de Perú (para 18·M5, calendario macro).
//
// Días NO laborables oficiales. Fijos + Semana Santa (móvil, calculada aparte no
// hace falta: la hardcodeamos por año, son pocos). Fuente: feriados nacionales
// de Perú. Solo nacionales (no regionales). Editable cuando el Estado agregue o
// mueva alguno. Se listan 2026 y 2027 para cubrir el cruce de fin de año.

export interface PeruHoliday {
  /** YYYY-MM-DD (fecha local de Lima). */
  date: string
  name: string
}

export const PERU_HOLIDAYS: PeruHoliday[] = [
  // 2026
  { date: '2026-01-01', name: 'Año Nuevo' },
  { date: '2026-04-02', name: 'Jueves Santo' },
  { date: '2026-04-03', name: 'Viernes Santo' },
  { date: '2026-05-01', name: 'Día del Trabajo' },
  { date: '2026-06-07', name: 'Batalla de Arica y Día de la Bandera' },
  { date: '2026-06-29', name: 'San Pedro y San Pablo' },
  { date: '2026-07-28', name: 'Fiestas Patrias' },
  { date: '2026-07-29', name: 'Fiestas Patrias' },
  { date: '2026-08-06', name: 'Batalla de Junín' },
  { date: '2026-08-30', name: 'Santa Rosa de Lima' },
  { date: '2026-10-08', name: 'Combate de Angamos' },
  { date: '2026-11-01', name: 'Día de Todos los Santos' },
  { date: '2026-12-08', name: 'Inmaculada Concepción' },
  { date: '2026-12-09', name: 'Batalla de Ayacucho' },
  { date: '2026-12-25', name: 'Navidad' },
  // 2027
  { date: '2027-01-01', name: 'Año Nuevo' },
  { date: '2027-03-25', name: 'Jueves Santo' },
  { date: '2027-03-26', name: 'Viernes Santo' },
  { date: '2027-05-01', name: 'Día del Trabajo' },
  { date: '2027-06-07', name: 'Batalla de Arica y Día de la Bandera' },
  { date: '2027-06-29', name: 'San Pedro y San Pablo' },
]
