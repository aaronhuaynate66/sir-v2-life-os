// SIR V2 — Una meta sin UN SOLO paso. PURO.
//
// ═══ POR QUÉ EXISTE ═══════════════════════════════════════════════════════════
//
// Aaron tiene 5 objetivos activos con **cero tareas**. Dos de ellos —"Subir
// ingresos a S/ 15,000/mes" y "Cliente recurrente de S/ 5,000/mes"— vencen el
// 31-ago y no tienen ni un paso escrito. Son metas que existen solo como título.
//
// Se lo planteé dos veces y las dos veces la conversación murió, porque lo que le
// llevaba era el PROBLEMA ("tienes 5 metas vacías, ¿qué hacemos?"). Pensar el plan
// desde cero es justo el trabajo que el sistema debería quitarle.
//
// El 1-ago Aaron lo nombró: *"no veo productividad en cómo vamos a mejorar SIR"*,
// y eligió la dirección — que SIR llegue con la acción hecha. Así que esta señal
// no pregunta qué hacer: **ofrece traer el plan**, y él acepta o corta.
//
// ═══ POR QUÉ SOLO CUENTA `kind: 'task'` ══════════════════════════════════════
//
// Los `key_result` son el "cómo se ve el éxito" (estilo OKR) y varias de estas
// metas SÍ los tienen — "Pipeline de prospectos calificados", "Cierre y onboarding
// del cliente". Contarlos como plan sería mentirse: describen el destino, no el
// primer paso. Una meta con 4 key_results y 0 tareas está igual de parada que una
// vacía, y de hecho es más engañosa porque parece llena.
//
// PURO: cero red, cero DB.

export interface MetaLite {
  id: string
  title: string
  status: string
  /** 'YYYY-MM-DD' o null. */
  targetDate: string | null
}

export interface PasoLite {
  objectiveId: string
  /** Solo 'task' cuenta como plan. */
  kind: string | null
  status: string
}

export interface MetaSinPlan {
  id: string
  title: string
  /** Días hasta el límite. null si la meta no tiene fecha. */
  dias: number | null
}

const DAY = 86_400_000

/**
 * La meta activa sin ninguna tarea que más apremia. PURA. null si no hay.
 *
 * Prioriza por CERCANÍA DEL LÍMITE, y las que no tienen fecha van al final: una
 * meta sin plan y sin fecha es un deseo, y no vale la pena empujarla por encima de
 * una que vence en 30 días.
 */
export function metaSinPlan(
  metas: readonly MetaLite[],
  pasos: readonly PasoLite[],
  hoy: string,
): MetaSinPlan | null {
  const ahora = Date.parse(`${hoy}T00:00:00Z`)
  if (!Number.isFinite(ahora)) return null

  const conTareas = new Set<string>()
  for (const p of pasos ?? []) {
    if (p?.kind === 'task' && p.status !== 'descartado') conTareas.add(p.objectiveId)
  }

  const vacias: MetaSinPlan[] = []
  for (const m of metas ?? []) {
    if (!m?.id || !m?.title || m.status !== 'active') continue
    if (conTareas.has(m.id)) continue
    const t = m.targetDate ? Date.parse(`${String(m.targetDate).slice(0, 10)}T00:00:00Z`) : NaN
    vacias.push({ id: m.id, title: m.title, dias: Number.isFinite(t) ? Math.round((t - ahora) / DAY) : null })
  }
  if (vacias.length === 0) return null

  vacias.sort((a, b) => {
    if (a.dias === null && b.dias === null) return 0
    if (a.dias === null) return 1
    if (b.dias === null) return -1
    return a.dias - b.dias
  })
  return vacias[0]
}

/**
 * La línea del brief. null si no hay. PURA.
 *
 * Ofrece, no interroga. "¿Qué hacemos con esto?" le devuelve el trabajo; "¿te armo
 * el plan?" se responde con un toque.
 */
export function metaSinPlanLine(m: MetaSinPlan | null | undefined): string | null {
  if (!m) return null
  const titulo = m.title.length > 52 ? `${m.title.slice(0, 51)}…` : m.title
  const cuando = m.dias === null ? 'no tiene ni un paso escrito'
    : m.dias < 0 ? `venció hace ${-m.dias} días y no tiene ni un paso escrito`
    : m.dias === 0 ? 'vence HOY y no tiene ni un paso escrito'
    : `vence en ${m.dias} días y no tiene ni un paso escrito`
  return `🎯 "${titulo}" ${cuando}. ¿Te armo el plan?`
}

// ─── Parseo del plan que devuelve el modelo ──────────────────────────────────

export interface PasoPropuesto {
  title: string
  /** Días desde hoy en que tocaría. */
  enDias: number
}

/** Tope de pasos que se crean de una: más que esto es un muro, no un plan. */
export const MAX_PASOS = 5

/**
 * Convierte la respuesta del modelo en pasos. PURA. [] si no se puede confiar.
 *
 * Formato exigido, una línea por paso: `N. <título> | <días>`
 *
 * Es DELIBERADAMENTE estricto. Estos pasos se ESCRIBEN en sus objetivos, así que
 * un parseo generoso que "interprete" prosa terminaría creándole basura en su
 * plan. Si el formato no viene claro, devuelve [] y el caller le muestra el texto
 * como propuesta sin escribir nada: mejor que lea y decida, a que le ensucien los
 * objetivos.
 */
export function parsePlanPropuesto(texto: string): PasoPropuesto[] {
  const out: PasoPropuesto[] = []
  for (const raw of (texto ?? '').split(/\r?\n/)) {
    const m = /^\s*\d+\s*[.)-]\s*(.+?)\s*\|\s*(\d{1,3})\s*$/.exec(raw)
    if (!m) continue
    const title = m[1].replace(/\s+/g, ' ').trim()
    const enDias = Number(m[2])
    if (title.length < 8 || title.length > 140) continue
    if (!Number.isInteger(enDias) || enDias < 0 || enDias > 365) continue
    out.push({ title, enDias })
    if (out.length >= MAX_PASOS) break
  }
  return out
}

/** 'YYYY-MM-DD' a N días de `hoy`. PURA. null si `hoy` no parsea. */
export function fechaEnDias(hoy: string, enDias: number): string | null {
  const base = Date.parse(`${hoy}T00:00:00Z`)
  if (!Number.isFinite(base)) return null
  return new Date(base + enDias * DAY).toISOString().slice(0, 10)
}
