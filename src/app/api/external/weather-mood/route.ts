// SIR V2 — GET /api/external/weather-mood (18·M2).
//
// Cruza el clima reciente de Lima (últimos ~9 días) con tu energía de self_metrics
// y corre el motor PURO assessWeatherMood. Devuelve una nota honesta SOLO cuando
// hay racha gris + un bajón real que coincide (si no, note = null → la card no se
// muestra). Sin LLM: instantáneo. Lecturas RLS-scoped.

import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { reportApiError } from '@/lib/observability/reportApiError'
import { fetchWeather } from '@/lib/day/weather'
import { limaDayKey, todayLimaKey } from '@/lib/dates/limaDay'
import { assessWeatherMood, type WeatherObservation, type EnergyPoint } from '@/lib/external/weatherMood'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

const DAY_MS = 86_400_000
const WINDOW_DAYS = 9

function lastDates(nowMs: number, n: number): string[] {
  const out: string[] = []
  for (let i = 0; i < n; i++) out.push(todayLimaKey(nowMs - i * DAY_MS))
  return out.reverse()
}

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  const userId = authData.user.id
  const nowMs = Date.now()
  const dates = lastDates(nowMs, WINDOW_DAYS)
  const sinceIso = new Date(nowMs - (WINDOW_DAYS + 1) * DAY_MS).toISOString()

  // Energía por día (Lima) desde self_metrics.
  const energy: EnergyPoint[] = []
  try {
    const { data } = await supabase
      .from('self_metrics')
      .select('category, value, timestamp')
      .eq('user_id', userId)
      .eq('category', 'energy')
      .gte('timestamp', sinceIso)
      .limit(60)
    const byDate = new Map<string, number[]>()
    for (const r of (data ?? []) as Array<{ value: number; timestamp: string }>) {
      const day = limaDayKey(r.timestamp)
      if (!day) continue
      const arr = byDate.get(day) ?? []
      arr.push(r.value)
      byDate.set(day, arr)
    }
    for (const [date, vals] of byDate) {
      energy.push({ date, value: vals.reduce((a, b) => a + b, 0) / vals.length })
    }
  } catch (e) {
    reportApiError(e, { route: 'external/weather-mood', step: 'energy' })
  }

  // Clima por día (Open-Meteo, en paralelo, best-effort).
  const weather: WeatherObservation[] = []
  try {
    const results = await Promise.all(
      dates.map(async (date) => {
        const w = await fetchWeather(date).catch(() => null)
        return w ? { date, code: w.code, precipMm: w.precipMm } : null
      }),
    )
    for (const r of results) if (r) weather.push(r)
  } catch (e) {
    reportApiError(e, { route: 'external/weather-mood', step: 'weather' })
  }

  const signal = assessWeatherMood(weather, energy)
  return NextResponse.json({ signal })
}
