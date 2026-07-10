// SIR V2 — Estado bio de Aaron para calibrar consejos relacionales.
//
// Base científica (docs 11 + 13): la capacidad de tener BIEN una conversación
// difícil es DEPENDIENTE DEL ESTADO. Fuera de la ventana de tolerancia (estrés
// alto + sueño bajo + HRV en caída) el consejo correcto NO es una estrategia —
// es bajar la activación primero (Gross, modulación de respuesta). Este helper
// trae el estado agudo (día) + acumulado (semana: deuda de sueño) y lo resume
// para el prompt, para que SIR/ensayo lo factoricen.

import type { SupabaseClient } from '@supabase/supabase-js'
import { assessEmotionWindow, type EmotionWindow } from '@/engines/emotion'
import { accumulatedSleepDebt } from '@/lib/sleep/debt'

export interface SelfBioState {
  window: EmotionWindow
  sleepDebtHours: number | null
  /** Bloque de texto para el prompt, o null si no hay data suficiente. */
  block: string | null
}

const DAY_MS = 86_400_000

/** Trae el estado bio reciente de Aaron y computa la ventana de tolerancia. */
export async function getSelfBioState(
  supabase: SupabaseClient,
  userId: string,
  nowMs: number,
): Promise<SelfBioState> {
  const sinceIso = new Date(nowMs - 32 * DAY_MS).toISOString()

  const [metricsRes, healthRes, sleepRes] = await Promise.all([
    supabase.from('self_metrics').select('category, value, timestamp:measured_at').eq('user_id', userId).gte('measured_at', sinceIso).limit(400),
    supabase.from('health_metrics').select('type, value, timestamp:measured_at').eq('user_id', userId).eq('type', 'hrv_avg').gte('measured_at', sinceIso).limit(200),
    supabase.from('sleep_records').select('date, duration').eq('user_id', userId).gte('date', sinceIso.slice(0, 10)).limit(60),
  ])

  const metrics = (metricsRes.data ?? []) as Array<{ category: string; value: number; timestamp: string }>
  const stress = metrics.filter((m) => m.category === 'stress').map((m) => ({ value: m.value, at: m.timestamp }))
  const hrv = ((healthRes.data ?? []) as Array<{ value: number; timestamp: string }>).map((h) => ({ value: h.value, at: h.timestamp }))
  const sleepRows = (sleepRes.data ?? []) as Array<{ date: string; duration: number }>
  const sleepHours = sleepRows.map((s) => ({ value: s.duration, at: s.date }))

  const window = assessEmotionWindow({ stress, hrv, sleepHours }, nowMs)
  const debt = accumulatedSleepDebt(sleepRows.map((s) => ({ date: s.date, duration: s.duration })), nowMs)
  const sleepDebtHours = debt.sufficient ? debt.debtHours : null

  // Energía/ánimo recientes (últimos 3 días) para color adicional.
  const recentStart = nowMs - 3 * DAY_MS
  const recentEnergy = avgRecent(metrics, 'energy', recentStart)
  const recentMood = avgRecent(metrics, 'mood', recentStart)

  const block = buildBlock(window, sleepDebtHours, recentEnergy, recentMood)
  return { window, sleepDebtHours, block }
}

function avgRecent(metrics: Array<{ category: string; value: number; timestamp: string }>, cat: string, sinceMs: number): number | null {
  const vals = metrics.filter((m) => m.category === cat && Date.parse(m.timestamp) >= sinceMs).map((m) => m.value)
  return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null
}

function buildBlock(window: EmotionWindow, sleepDebt: number | null, energy: number | null, mood: number | null): string | null {
  const bits: string[] = []
  if (window.state !== 'insufficient') {
    bits.push(`ventana de tolerancia: ${window.state === 'narrow' ? 'ANGOSTA (fuera de la ventana)' : window.state === 'watch' ? 'tensionada' : 'abierta'}`)
    const sig = [window.stressElevated && 'estrés elevado', window.hrvDown && 'HRV en caída', window.sleepLow && 'sueño bajo'].filter(Boolean)
    if (sig.length) bits.push(sig.join(', '))
  }
  if (sleepDebt !== null && sleepDebt >= 2) bits.push(`deuda de sueño acumulada ~${sleepDebt}h`)
  if (energy !== null) bits.push(`energía reciente ${energy}/10`)
  if (mood !== null) bits.push(`ánimo reciente ${mood}/10`)
  if (bits.length === 0) return null

  const lines = [`Estado bio de Aaron AHORA (para calibrar el consejo — la ventana de tolerancia manda): ${bits.join(' · ')}.`]
  if (window.state === 'narrow') {
    lines.push('IMPORTANTE: Aaron está FUERA de su ventana. La ciencia (Gross) dice que acá el consejo correcto NO es una estrategia de conversación — es REGULAR PRIMERO (bajar activación: respirar, moverse, dormir) y recién después hablar. Priorizá eso en "read" y en la primera acción; no lo empujes a una conversación difícil en caliente.')
  } else if (window.state === 'watch') {
    lines.push('Está tensionado pero dentro de la ventana: sirve un reencuadre antes de actuar, y cuidar de no descargar el propio estado en la conversación.')
  }
  return lines.join('\n')
}
