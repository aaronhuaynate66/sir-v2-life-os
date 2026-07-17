// SIR V2 — GET/POST /api/salud/exams — historial médico / chequeos (mig 0149).
//
// Registro puntual de chequeos médicos (aparte de la serie diaria health_metrics,
// para no contaminar baselines). GET fail-open mientras la migración propaga.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rowToHealthExam, type HealthExam } from '@/lib/health-exams/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DOCS_BUCKET = 'person-documents'

function err(status: number, error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status })
}

const SELECT = 'id, exam_date, provider, title, summary, findings, values, recommendations, storage_path'

export async function GET() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado', 'Inicia sesión y reinténtalo.')
  try {
    const { data, error } = await supabase
      .from('health_exams')
      .select(SELECT)
      .eq('user_id', auth.user.id)
      .order('exam_date', { ascending: false })
      .limit(100)
    if (error) throw error
    const exams: HealthExam[] = []
    for (const row of data ?? []) {
      const { storagePath, ...rest } = rowToHealthExam(row as Record<string, unknown>)
      let pdfUrl: string | null = null
      if (storagePath) {
        try {
          const { data: signed } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(storagePath, 3600)
          pdfUrl = signed?.signedUrl ?? null
        } catch { /* sin firma → sin link */ }
      }
      exams.push({ ...rest, pdfUrl })
    }
    return NextResponse.json({ exams })
  } catch {
    // Tabla 0149 aún no propagada → sin chequeos (no rompe /salud).
    return NextResponse.json({ exams: [] })
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return err(401, 'No autenticado', 'Inicia sesión y reinténtalo.')
  let b: Record<string, unknown>
  try { b = (await req.json()) as Record<string, unknown> } catch { return err(400, 'Body inválido') }
  const examDate = typeof b.examDate === 'string' ? b.examDate : ''
  const title = typeof b.title === 'string' ? b.title.slice(0, 200).trim() : ''
  if (!examDate || !title) return err(400, 'examDate y title requeridos')
  const row = {
    user_id: auth.user.id,
    exam_date: examDate,
    provider: typeof b.provider === 'string' ? b.provider.slice(0, 200) : null,
    title,
    summary: typeof b.summary === 'string' ? b.summary.slice(0, 4000) : null,
    findings: Array.isArray(b.findings) ? b.findings : [],
    values: Array.isArray(b.values) ? b.values : [],
    recommendations: Array.isArray(b.recommendations) ? b.recommendations : [],
    storage_path: typeof b.storagePath === 'string' ? b.storagePath : null,
  }
  const { data, error } = await supabase.from('health_exams').insert(row).select(SELECT).single()
  if (error) return err(500, 'No se pudo guardar el chequeo', error.message)
  const { storagePath, ...rest } = rowToHealthExam(data as Record<string, unknown>)
  return NextResponse.json({ exam: { ...rest, pdfUrl: null } })
}
