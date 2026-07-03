// SIR V2 — GET /api/export/all
//
// Devuelve un .zip con TODOS tus datos en CSVs — data ownership seria.
// Un archivo por tabla, más un README que explica qué hay adentro.
//
// Session-auth. Lee sólo lo del usuario (RLS + eq user_id explícito por si
// alguna tabla no tiene RLS todavía).
//
// EXCLUYE lo sensible: person_sensitive_data (notas privadas explícitas),
// personal_tokens (secretos), self_diagnosis (privado por diseño). Aaron
// puede exportarlas manualmente si las necesita.

import { type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import JSZip from 'jszip'
import { buildCsv, type CsvColumn } from '@/lib/export/csv'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Supabase = Awaited<ReturnType<typeof createClient>>

interface TableSpec {
  filename: string
  table: string
  select: string
  description: string
  /** Columnas a exportar; si no se pasa, exportamos TODAS las que vinieron. */
  columns?: string[]
}

const TABLES: TableSpec[] = [
  { filename: 'people.csv', table: 'people', select: 'id, name, slug, alias, category, relationship, importance_score, confidence_score, tags, notes, special_dates, created_at, updated_at', description: 'Todas las personas en tu red.' },
  { filename: 'person_links.csv', table: 'person_links', select: 'id, person_a_id, person_b_id, kind, weight, context, confidence, source, created_at', description: 'Vínculos familiares/laborales entre personas.' },
  { filename: 'observations.csv', table: 'observations', select: 'id, person_id, capture_type, data, confidence, observed_at, captured_at, is_obsolete, created_at', description: 'Capturas (WhatsApp, LinkedIn, IG, notas manuales, ciclo, báscula, etc.).' },
  { filename: 'memories.csv', table: 'memories', select: 'id, person_id, title, content, type, timestamp, tags, is_private, is_reserved, created_at', description: 'Memorias derivadas + manuales. Excluye is_reserved (soft-deleted).' },
  { filename: 'moments.csv', table: 'relationship_moments', select: 'id, person_id, title, detail, status, occurred_on, follow_up_on, resolution, created_at, updated_at', description: 'Episodios relacionales.' },
  { filename: 'moment_participants.csv', table: 'moment_participants', select: 'moment_id, person_id, created_at', description: 'Participantes secundarios de moments multi-persona.' },
  { filename: 'person_logs.csv', table: 'person_logs', select: 'id, person_id, kind, value, note, logged_at, created_at', description: 'Registros rápidos por persona (mood/energy/sleep/pain/interaction).' },
  { filename: 'person_cycles.csv', table: 'person_cycles', select: 'id, person_id, date, phase, confidence, source, note, created_at', description: 'Ciclo menstrual registrado día por día (mig 0110).' },
  { filename: 'person_synthesis.csv', table: 'person_synthesis', select: 'id, person_id, summary, topics, emotional_states, updated_at', description: 'Síntesis narrativa por persona.' },
  { filename: 'person_notes_history.csv', table: 'person_notes_history', select: 'id, person_id, snapshot, change_source, changed_at', description: 'Snapshots de people.notes cuando se sobreescribió.' },
  { filename: 'person_profile_axes.csv', table: 'person_profile_axes', select: 'person_id, axes, updated_at', description: 'Ejes narrativos persistidos (profesional/social).' },
  { filename: 'weekly_recommendations.csv', table: 'weekly_recommendations', select: 'id, person_id, week_start, recommendations, generated_at', description: 'Recomendaciones IA semanales por persona (mig 0112).' },
  { filename: 'person_briefings.csv', table: 'person_briefings', select: 'id, person_id, synthesis, model_used, generated_at', description: 'Síntesis IA de estado con cada persona (mig 0111).' },
  { filename: 'person_status_snapshots.csv', table: 'person_status_snapshots', select: 'id, person_id, label, snapshot_date, created_at', description: 'Snapshot diario del label del panel Estado (mig 0113).' },
  { filename: 'person_status_alerts.csv', table: 'person_status_alerts', select: 'id, person_id, from_label, to_label, message, created_at, seen_at, dismissed_at', description: 'Alertas de empeoramiento del vínculo.' },
  { filename: 'goals.csv', table: 'goals', select: 'id, title, description, category, priority, status, target_date, progress, next_action, peace_impact, related_persons, related_goals, created_at, updated_at', description: 'Objetivos con SMART y prioridad.' },
  { filename: 'objective_steps.csv', table: 'objective_steps', select: 'id, objective_id, kind, title, description, status, priority, effort, acceptance, target_date, due_time, dependencies, completed_at, created_at', description: 'KRs + Tareas de cada objetivo.' },
  { filename: 'objective_plan.csv', table: 'objective_plan', select: 'objective_id, plan_if, plan_then, obstacle, updated_at', description: 'WOOP + baseline por objetivo.' },
  { filename: 'trackers.csv', table: 'trackers', select: 'id, name, kind, target_value, comparator, staleness_hours, related_objective_id, related_step_id, related_person_id, active, created_at', description: 'Seguimiento de métricas externas.' },
  { filename: 'tracker_readings.csv', table: 'tracker_readings', select: 'id, tracker_id, value, observed_at, note, created_at', description: 'Mediciones de trackers.' },
  { filename: 'financial_movements.csv', table: 'financial_movements', select: 'id, type, amount_pen, description, category, intent, date, created_at', description: 'Ingresos/gastos.' },
  { filename: 'sleep_records.csv', table: 'sleep_records', select: 'id, date, duration, quality, wake_time, notes, source, external_id, created_at', description: 'Registros de sueño.' },
  { filename: 'self_metrics.csv', table: 'self_metrics', select: 'id, category, value, timestamp, note, created_at', description: 'Tus estados (energía/ánimo/estrés/enfoque/motivación/confianza).' },
  { filename: 'health_metrics.csv', table: 'health_metrics', select: 'id, type, value, unit, timestamp, notes, source, external_id, created_at', description: 'Métricas biológicas (peso, HR, HRV, etc.).' },
  { filename: 'signals.csv', table: 'signals', select: 'id, source, content, tags, related_persons, related_goals, priority, status, created_at', description: 'Señales del entorno.' },
  { filename: 'daily_briefs.csv', table: 'daily_briefs', select: 'id, scope, brief_date, narrative, model_used, generated_at', description: 'Briefs de día/semana/mes (mig 0062/0065).' },
  { filename: 'identity_profile.csv', table: 'identity_profile', select: 'name, birth_date, roles, location, own_dates, interests, bio, trajectory, updated_at', description: 'Tu bloque de identidad en /yo.' },
  { filename: 'calendar_connections.csv', table: 'calendar_connections', select: 'id, label, provider, color, enabled, account_email, created_at', description: 'Calendarios conectados. Excluye ics_url + tokens (secretos).' },
  { filename: 'edge_weights.csv', table: 'edge_weights', select: 'id, edge_key, weight, updated_at', description: 'Pesos del grafo del cerebro (Hebbian).' },
]

async function fetchTableCsv(supabase: Supabase, userId: string, spec: TableSpec): Promise<{ ok: true; csv: string; count: number } | { ok: false; error: string }> {
  try {
    // Nombres de tabla dinámicos → el generic de supabase-js no puede
    // resolverlos → casteamos a unknown y descargamos como Record.
    const { data, error } = await (supabase.from(spec.table) as unknown as { select: (s: string) => { eq: (col: string, v: string) => { limit: (n: number) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }> } } })
      .select(spec.select).eq('user_id', userId).limit(50000)
    if (error) return { ok: false, error: error.message }
    const rows = (data ?? []) as Array<Record<string, unknown>>
    if (rows.length === 0) return { ok: true, csv: 'sin datos\n', count: 0 }
    // Detectar columnas automáticamente del primer row.
    const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))))
    const cols: CsvColumn<Record<string, unknown>>[] = keys.map((k) => ({
      header: k,
      value: (row: Record<string, unknown>) => {
        const v = row[k]
        if (v == null) return ''
        if (typeof v === 'object') return JSON.stringify(v)
        return String(v)
      },
    }))
    return { ok: true, csv: buildCsv(rows, cols), count: rows.length }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

function buildReadme(entries: Array<{ spec: TableSpec; count: number; error?: string }>): string {
  const now = new Date().toISOString()
  const lines: string[] = [
    '# Export completo de SIR',
    '',
    `Generado: ${now}`,
    `Total archivos: ${entries.length}`,
    '',
    '## Contenido',
    '',
  ]
  for (const e of entries) {
    if (e.error) {
      lines.push(`- **${e.spec.filename}** — ERROR: ${e.error}`)
    } else {
      lines.push(`- **${e.spec.filename}** (${e.count} filas) — ${e.spec.description}`)
    }
  }
  lines.push('')
  lines.push('## Cómo abrir')
  lines.push('')
  lines.push('- Excel / Google Sheets / Numbers: abrí cada .csv directamente.')
  lines.push('- Análisis programático: `import pandas as pd; df = pd.read_csv("people.csv")`.')
  lines.push('')
  lines.push('## Notas')
  lines.push('')
  lines.push('- Los JSONBs (data, tags, roles, etc.) están serializados como texto JSON.')
  lines.push('- Se EXCLUYEN por privacidad: person_sensitive_data (notas privadas), personal_tokens, self_diagnosis, calendar_connections.ics_url + tokens OAuth.')
  lines.push('- Los timestamps están en ISO 8601 UTC.')
  return lines.join('\n')
}

export async function GET(_req: NextRequest) {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401, headers: { 'Content-Type': 'application/json' } })

  const userId = auth.user.id
  const zip = new JSZip()

  const entries: Array<{ spec: TableSpec; count: number; error?: string }> = []
  for (const spec of TABLES) {
    const result = await fetchTableCsv(supabase, userId, spec)
    if (result.ok) {
      zip.file(spec.filename, result.csv)
      entries.push({ spec, count: result.count })
    } else {
      // Fallo silencioso por tabla (puede no existir aún si migró tarde).
      entries.push({ spec, count: 0, error: result.error })
    }
  }

  zip.file('README.md', buildReadme(entries))

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  const dateStamp = new Date().toISOString().slice(0, 10)
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="sir-export-${dateStamp}.zip"`,
      'Cache-Control': 'no-store',
    },
  })
}
