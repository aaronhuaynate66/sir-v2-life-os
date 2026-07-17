// SIR V2 — Tipos del historial médico / chequeos (health_exams, mig 0149).

export type ExamValueFlag = 'high' | 'low' | 'normal'

export interface ExamFinding {
  /** Código CIE10 (ej. "E67.8"). */
  code: string
  label: string
}

export interface ExamValue {
  name: string
  value: string
  unit?: string
  /** Rango de referencia ("13 - 17.5"). */
  range?: string
  flag: ExamValueFlag
}

export interface HealthExam {
  id: string
  examDate: string
  provider: string | null
  title: string
  summary: string | null
  findings: ExamFinding[]
  values: ExamValue[]
  recommendations: string[]
  /** Signed URL del PDF (la arma el endpoint al listar), o null. */
  pdfUrl: string | null
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : []
}

/** Fila cruda de Supabase → HealthExam (sin la signed URL; el route la agrega). */
export function rowToHealthExam(r: Record<string, unknown>): Omit<HealthExam, 'pdfUrl'> & { storagePath: string | null } {
  return {
    id: String(r.id ?? ''),
    examDate: String(r.exam_date ?? '').slice(0, 10),
    provider: (r.provider as string | null) ?? null,
    title: String(r.title ?? 'Chequeo'),
    summary: (r.summary as string | null) ?? null,
    findings: asArray<ExamFinding>(r.findings),
    values: asArray<ExamValue>(r.values),
    recommendations: asArray<string>(r.recommendations),
    storagePath: (r.storage_path as string | null) ?? null,
  }
}

/** ¿Hay algún valor fuera de rango? Para resaltar el chequeo de un vistazo. PURO. */
export function hasOutOfRange(values: ExamValue[]): boolean {
  return values.some((v) => v.flag === 'high' || v.flag === 'low')
}

/** Cuenta de valores fuera de rango. PURO. */
export function outOfRangeCount(values: ExamValue[]): number {
  return values.filter((v) => v.flag === 'high' || v.flag === 'low').length
}
