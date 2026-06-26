// SIR V2 — Hábitos: parser PURO de las sugerencias de la IA. Espera un array
// JSON; valida y recorta a máx. 2 (pocos y alineados, no una lista larga).
export interface HabitSuggestion {
  title: string
  cadence: 'daily' | 'weekly'
  targetPerPeriod: number
  rationale: string
}

export function parseHabitSuggestions(text: string): HabitSuggestion[] {
  if (!text) return []
  let raw = text.trim()
  const a = raw.indexOf('[')
  const b = raw.lastIndexOf(']')
  if (a >= 0 && b > a) raw = raw.slice(a, b + 1)
  let arr: unknown
  try { arr = JSON.parse(raw) } catch { return [] }
  if (!Array.isArray(arr)) return []
  const out: HabitSuggestion[] = []
  for (const it of arr) {
    if (!it || typeof it !== 'object') continue
    const o = it as Record<string, unknown>
    const title = typeof o.title === 'string' ? o.title.trim().slice(0, 80) : ''
    if (!title) continue
    const cadence = o.cadence === 'weekly' ? 'weekly' : 'daily'
    let target = typeof o.targetPerPeriod === 'number' ? Math.trunc(o.targetPerPeriod) : 1
    if (!Number.isFinite(target)) target = 1
    target = Math.max(1, Math.min(7, target))
    if (cadence === 'daily') target = 1
    const rationale = typeof o.rationale === 'string' ? o.rationale.trim().slice(0, 200) : ''
    out.push({ title, cadence, targetPerPeriod: target, rationale })
    if (out.length >= 2) break
  }
  return out
}
