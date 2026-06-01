// SIR V2 — POST /api/memories/embed (Fase 3b)
//
// Backfill idempotente de embeddings: toma las memorias del usuario SIN
// embedding (embedding is null), las embeddea en batch y las actualiza.
// Re-correrlo solo procesa lo que falta. Pensado para llamarse desde la
// UI de búsqueda ("indexar memorias") o un cron futuro.
//
// Body JSON (opcional): { batch?: number }  (default 100, máx 200)
// Response 200: { embedded, remaining, model }
//
// Requiere OPENAI_API_KEY (500 si falta). RLS via user session.

import { NextResponse, type NextRequest } from 'next/server'
import { reportApiError } from '@/lib/observability/reportApiError'

import { createClient } from '@/lib/supabase/server'
import { embedBatch, toPgVector, EMBEDDING_MODEL, EmbeddingError } from '@/lib/embeddings/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface ErrorBody {
  error: string
  detail?: string
}
function errorJson(status: number, error: string, detail?: string): NextResponse<ErrorBody> {
  return NextResponse.json({ error, detail }, { status })
}

/** Texto a embeddear por memoria: título + contenido. */
function memoryInput(row: { title: string | null; content: string | null }): string {
  const title = (row.title ?? '').trim()
  const content = (row.content ?? '').trim()
  return [title, content].filter(Boolean).join('\n').slice(0, 8000) || '(vacío)'
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return errorJson(401, 'No autenticado', 'Iniciá sesión y reintentá.')
  }
  const userId = authData.user.id

  let batch = 100
  try {
    const body = (await req.json()) as { batch?: unknown }
    if (typeof body?.batch === 'number' && Number.isFinite(body.batch)) {
      batch = Math.max(1, Math.min(200, Math.floor(body.batch)))
    }
  } catch {
    /* sin body -> default */
  }

  // Memorias sin embedding.
  const { data: rows, error: selErr } = await supabase
    .from('memories')
    .select('id, title, content')
    .eq('user_id', userId)
    .is('embedding', null)
    .limit(batch)
  if (selErr) return errorJson(500, 'No se pudieron leer las memorias', selErr.message)
  if (!rows || rows.length === 0) {
    return NextResponse.json({ embedded: 0, remaining: 0, model: EMBEDDING_MODEL }, { status: 200 })
  }

  // Embeddear en una sola llamada batch.
  let vectors: number[][]
  try {
    vectors = await embedBatch(rows.map((r) => memoryInput(r as { title: string | null; content: string | null })))
  } catch (e) {
    reportApiError(e)
    if (e instanceof EmbeddingError) {
      return errorJson(e.status && e.status >= 400 && e.status < 600 ? 502 : 500, 'Falló la generación de embeddings', e.message)
    }
    return errorJson(500, 'Falló la generación de embeddings', e instanceof Error ? e.message : String(e))
  }

  // Update por fila (RLS-scoped). Batch chico -> aceptable.
  let embedded = 0
  for (let i = 0; i < rows.length; i++) {
    const id = (rows[i] as { id: string }).id
    const { error: updErr } = await supabase
      .from('memories')
      .update({ embedding: toPgVector(vectors[i]), embedding_model: EMBEDDING_MODEL })
      .eq('id', id)
      .eq('user_id', userId)
    if (!updErr) embedded++
  }

  // ¿Cuántas quedan sin embedding?
  const { count } = await supabase
    .from('memories')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('embedding', null)

  return NextResponse.json(
    { embedded, remaining: count ?? 0, model: EMBEDDING_MODEL },
    { status: 200 },
  )
}
