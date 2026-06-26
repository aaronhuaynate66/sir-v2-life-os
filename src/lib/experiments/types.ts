// SIR V2 — Loop de Experimentos (Motor #2). Tipos compartidos.
export type ExperimentStatus = 'activo' | 'hecho' | 'descartado'
export type ExperimentSource = 'espejo' | 'manual'
/** ¿Te funcionó? Se marca al cerrar — alimenta el historial de prueba y error. */
export type ExperimentWorked = 'si' | 'no' | 'parcial'

export interface Experiment {
  id: string
  title: string
  detail: string | null
  source: ExperimentSource
  status: ExperimentStatus
  weekStart: string | null // YYYY-MM-DD (lunes Lima)
  result: string | null
  worked: ExperimentWorked | null
  createdAt: string
  updatedAt: string
}

interface RawExperimentRow {
  id: string
  title: string
  detail: string | null
  source: string
  status: string
  week_start: string | null
  result: string | null
  worked: string | null
  created_at: string
  updated_at: string
}

function asWorked(v: string | null | undefined): ExperimentWorked | null {
  return v === 'si' || v === 'no' || v === 'parcial' ? v : null
}

export function mapExperimentRow(r: RawExperimentRow): Experiment {
  return {
    id: r.id,
    title: r.title,
    detail: r.detail,
    source: r.source === 'espejo' ? 'espejo' : 'manual',
    status: r.status === 'hecho' ? 'hecho' : r.status === 'descartado' ? 'descartado' : 'activo',
    weekStart: r.week_start ? r.week_start.slice(0, 10) : null,
    result: r.result,
    worked: asWorked(r.worked),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** Conteo de resultados para el historial de prueba y error. */
export function tallyWorked(items: Pick<Experiment, 'worked'>[]): { si: number; no: number; parcial: number } {
  const t = { si: 0, no: 0, parcial: 0 }
  for (const e of items) {
    if (e.worked === 'si') t.si++
    else if (e.worked === 'no') t.no++
    else if (e.worked === 'parcial') t.parcial++
  }
  return t
}

/** Lunes (Lima) de la semana de `now`, como 'YYYY-MM-DD'. */
export function mondayLima(now: Date = new Date()): string {
  const limaStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const d = new Date(`${limaStr}T00:00:00Z`)
  const dow = d.getUTCDay()
  const diff = (dow + 6) % 7
  d.setUTCDate(d.getUTCDate() - diff)
  return d.toISOString().slice(0, 10)
}
