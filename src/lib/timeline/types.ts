// SIR V2 — Timeline types (Fase 3a Issue #70)
// Tipos compartidos para la vista /timeline. Shape unificada por ADR 0005 D3:
// cada tabla fuente se proyecta a TimelineEvent via su adapter, y los detalles
// type-specific viven en `meta` con tipo libre.

/**
 * Las 8 categorias de evento del timeline. Cada una mapea a una o mas
 * tablas fuente via adapters en src/lib/timeline/adapters/.
 */
export type TimelineEventType =
  | 'memory'
  | 'self_metric'
  | 'health'
  | 'sleep'
  | 'finance'
  | 'signal'
  | 'goal_event'
  | 'relational_event'

export const ALL_EVENT_TYPES: readonly TimelineEventType[] = [
  'memory',
  'self_metric',
  'health',
  'sleep',
  'finance',
  'signal',
  'goal_event',
  'relational_event',
] as const

/**
 * Shape unificada de un evento del feed. Los adapters convierten cada fila
 * de Supabase (o fixture) a este shape; los componentes UI no hacen switch
 * por tipo salvo para icon + color.
 */
export interface TimelineEvent {
  /** ID estable. Convencion: `${type}:${sourceId}` o
   *  `${type}:${sourceId}:${subIndex}` para items de history desempaquetados. */
  id: string
  type: TimelineEventType
  /** Timestamp canonico ISO 8601 (clave de orden DESC). */
  occurredAt: string
  /** Titulo corto, formateado en español. */
  title: string
  /** Detalle opcional (1-2 lineas). */
  body?: string
  /** Tags visibles como chips. Pueden ser categorias, fuentes, etc. */
  tags: string[]
  /** Data type-specific. Forma libre (ver ADR 0005 R9). */
  meta: Record<string, unknown>
}

/**
 * Presets del rango temporal expuestos en el filtro. "all" es sin tope.
 * El custom range queda fuera de Fase 3a #70 (se evalua en #71).
 */
export type DateRangePreset = 'today' | '7d' | '30d' | '90d' | '1y' | 'all'

export const DATE_RANGE_PRESETS: readonly DateRangePreset[] = [
  'today',
  '7d',
  '30d',
  '90d',
  '1y',
  'all',
] as const

export const DATE_RANGE_LABEL: Record<DateRangePreset, string> = {
  today: 'Hoy',
  '7d': '7 días',
  '30d': '30 días',
  '90d': '90 días',
  '1y': '1 año',
  all: 'Todo',
}

/**
 * Filtros aplicados al feed. `types` vacio se interpreta como "todos activos".
 */
export interface TimelineFilters {
  dateRange: DateRangePreset
  types: Set<TimelineEventType>
  /** Trimmed; cadena vacia = sin busqueda activa. */
  search: string
}

export const DEFAULT_FILTERS: TimelineFilters = {
  dateRange: '30d',
  types: new Set(ALL_EVENT_TYPES),
  search: '',
}

/**
 * Cursor para paginacion. ISO timestamp del ultimo evento de la pagina anterior.
 * `null` = primera pagina.
 */
export type TimelineCursor = string | null

export const TIMELINE_PAGE_SIZE = 50

/**
 * Resultado bruto de una fetch (per-type adapter run). Sirve para que el hook
 * sepa que types fallaron sin perder los exitosos.
 */
export interface FetchTypeResult {
  type: TimelineEventType
  ok: boolean
  events: TimelineEvent[]
  error?: Error
}
