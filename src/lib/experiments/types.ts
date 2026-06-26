// SIR V2 — Loop de Experimentos (Motor #2). Tipos compartidos.
export type ExperimentStatus = 'activo' | 'hecho' | 'descartado'
export type ExperimentSource = 'espejo' | 'manual'

export interface Experiment {
  id: string
  title: string
  detail: string | null
  source: ExperimentSource
  status: ExperimentStatus
  weekStart: string | null // YYYY-MM-DD (lunes Lima)
  result: string | null
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
  created_at: string
  updated_at: string
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
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
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
