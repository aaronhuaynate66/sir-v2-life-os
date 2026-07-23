// SIR V2 — Lee/formatea el estado EN VIVO de la sesión de Claude Code (laptop).
//
// Complementa a githubStatus.ts: git cuenta lo YA commiteado/pusheado; esto cuenta
// lo que Claude Code está haciendo LOCAL ahora mismo (antes del commit). Lo escribe
// el hook local vía POST /api/dev/session; aquí lo leemos para el bot de dev.
// Fail-open: sin envs / error → null (el bot cae al estado de GitHub de siempre).

import { createClient } from '@supabase/supabase-js'

export interface DevSession {
  event: string
  summary: string | null
  activity: string | null
  branch: string | null
  changedFiles: string | null
  lastCommit: string | null
  updatedAt: string
}

export async function fetchLatestSession(): Promise<DevSession | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data } = await supabase
      .from('dev_session_status')
      .select('event, summary, activity, branch, changed_files, last_commit, updated_at')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) return null
    const d = data as Record<string, unknown>
    return {
      event: String(d.event ?? 'progress'),
      summary: (d.summary as string) ?? null,
      activity: (d.activity as string) ?? null,
      branch: (d.branch as string) ?? null,
      changedFiles: (d.changed_files as string) ?? null,
      lastCommit: (d.last_commit as string) ?? null,
      updatedAt: String(d.updated_at ?? ''),
    }
  } catch {
    return null
  }
}

/** "hace 30s / hace 5 min / hace 2 h / hace 1 d" desde un ISO. */
function hace(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const secs = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (secs < 90) return `hace ${secs}s`
  const mins = Math.round(secs / 60)
  if (mins < 90) return `hace ${mins} min`
  const hrs = Math.round(mins / 60)
  if (hrs < 36) return `hace ${hrs} h`
  return `hace ${Math.round(hrs / 24)} d`
}

/** Estado en vivo como texto plano (para el prompt del LLM / respuesta directa). */
export function formatSessionStatus(s: DevSession | null): string {
  if (!s) return 'SESIÓN EN VIVO: sin datos (Claude Code no ha reportado o el hook no está activo en la laptop).'
  const when = hace(s.updatedAt)
  const ageMs = Date.now() - Date.parse(s.updatedAt)
  const stale = Number.isFinite(ageMs) && ageMs > 20 * 60 * 1000
  const head =
    s.event === 'stop'
      ? `SESIÓN EN VIVO: Claude Code terminó su último turno ${when}.`
      : s.event === 'start'
        ? `SESIÓN EN VIVO: Claude Code arrancó una sesión ${when}.`
        : `SESIÓN EN VIVO: Claude Code activo (${when})${stale ? ' — quizá ya inactivo' : ''}.`
  const lines = [head]
  if (s.branch) lines.push(`Rama: ${s.branch}${s.lastCommit ? ` · último commit local: ${s.lastCommit}` : ''}`)
  if (s.activity) lines.push(`Última acción: ${s.activity}`)
  if (s.changedFiles) lines.push(`Cambios locales sin commitear:\n${s.changedFiles}`)
  if (s.summary) lines.push(`En qué anda / qué hizo:\n${s.summary}`)
  return lines.join('\n')
}
