// SIR V2 — Rutas cubiertas por el harness de QA móvil (issue #819).
//
// "Abarcar lo más posible": el grueso de las rutas top-level del nav. Las de
// detalle con param ([id]) se omiten (necesitan data específica); el objetivo es
// cazar overflow/roturas de layout en las pantallas que Aaron ve a diario.

/** Rutas PÚBLICAS (no requieren sesión) — se prueban siempre. */
export const PUBLIC_ROUTES: string[] = ['/auth/login']

/** Rutas de la app (requieren sesión) — se prueban si el login funcionó. */
export const APP_ROUTES: string[] = [
  // Hoy
  '/panel',
  '/sir',
  '/decidir',
  '/horario',
  '/planes',
  '/dia',
  '/linea',
  // Yo
  '/yo',
  '/diario',
  '/review',
  '/salud',
  '/habitos',
  '/medicacion',
  '/finanzas',
  '/scores',
  // Relaciones
  '/relaciones',
  '/relato/ingest',
  '/plantear',
  '/ensayo',
  '/tacticas',
  '/negociar',
  '/alter-ego',
  '/verificar',
  '/empresas',
  '/red',
  '/explorar',
  // Objetivos
  '/objetivos',
  '/oportunidades',
  '/seguimiento',
  '/senales',
  '/eventos',
  // Archivo
  '/captura',
  '/memoria',
  '/historial',
  '/resumen',
  '/consumo',
  '/reader',
]

export const ALL_ROUTES: string[] = [...PUBLIC_ROUTES, ...APP_ROUTES]
