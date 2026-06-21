// SIR V2 — Señal externa: clima por fecha (Open-Meteo, gratis, sin API key).
// Input del motor "¿qué pasó el día X?" + futura predicción de patrones.
// Best-effort: si falla o no hay dato, devuelve null y el día sigue igual.
// Lima por defecto (la ciudad de Aaron). Usa el endpoint forecast con rango,
// que cubre el pasado reciente (~92 días); para fechas viejas puede no traer.

export interface DayWeather {
  label: string
  tempMax: number | null
  tempMin: number | null
  precipMm: number | null
}

const LIMA = { lat: -12.046, lon: -77.043 }

// WMO weather codes → etiqueta corta en español.
function codeLabel(code: number | null, precip: number | null): string {
  if (code == null) return 'sin dato'
  if (code === 0) return 'Despejado'
  if (code <= 3) return 'Parcialmente nublado'
  if (code === 45 || code === 48) return 'Neblina'
  if (code >= 51 && code <= 57) return 'Garúa'
  if (code >= 61 && code <= 67) return 'Lluvia'
  if (code >= 71 && code <= 77) return 'Nieve'
  if (code >= 80 && code <= 82) return 'Chubascos'
  if (code >= 95) return 'Tormenta'
  return (precip ?? 0) > 1 ? 'Lluvioso' : 'Nublado'
}

/** Trae el clima de un día (YYYY-MM-DD) para Lima. null si no hay dato. */
export async function fetchWeather(date: string): Promise<DayWeather | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LIMA.lat}&longitude=${LIMA.lon}` +
    `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum` +
    `&timezone=America%2FLima&start_date=${date}&end_date=${date}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return null
    const j = (await res.json()) as { daily?: { weathercode?: number[]; temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_sum?: number[] } }
    const d = j.daily
    if (!d || !Array.isArray(d.weathercode) || d.weathercode.length === 0) return null
    const code = d.weathercode[0] ?? null
    const tMax = d.temperature_2m_max?.[0] ?? null
    const tMin = d.temperature_2m_min?.[0] ?? null
    const precip = d.precipitation_sum?.[0] ?? null
    const temp = tMax != null ? ` · ${Math.round(tMax)}°` : ''
    const rain = precip != null && precip > 0.2 ? ` · ${precip}mm` : ''
    return { label: `${codeLabel(code, precip)}${temp}${rain}`, tempMax: tMax, tempMin: tMin, precipMm: precip }
  } catch {
    return null
  }
}
