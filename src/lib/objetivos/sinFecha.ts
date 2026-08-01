// SIR V2 — Tareas SIN FECHA: el agujero negro de los objetivos. PURO.
//
// ═══ POR QUÉ EXISTE ═══════════════════════════════════════════════════════════
//
// El brief surfacea pasos POR FECHA (`dueTask`, `weekFocus`, `goalNudge`). Una
// tarea sin `target_date` no entra en ninguna de esas ventanas, así que **no
// aparece nunca**. No está descartada ni hecha: está invisible.
//
// Medido el 1-ago-2026: **6 tareas** así en objetivos activos. La de Marlab
// ("pedirle a Dayana que me conecte con su contacto") llevaba 13 días; cuatro del
// Mundial, 59 días. Aaron las escribió y el sistema se las tragó en silencio —
// otra vez el patrón de la sesión: SIR guarda más de lo que muestra.
//
// ═══ LO QUE ESTE MÓDULO **NO** HACE ═══════════════════════════════════════════
//
// No les inventa una fecha. Poner una fecha es planificar, y planificar es
// decisión de Aaron. Lo único que hace es **pedirle la fecha**, que es lo que
// convierte la tarea en algo que el brief puede volver a mostrar.
//
// Y pide UNA, la más vieja, no las seis. Un brief con seis pedidos es el muro del
// que ya se quejó (#1039); uno solo es una pregunta que se responde de un toque.
//
// OJO: los `key_result` quedan fuera a propósito. Son los resultados esperados de
// un objetivo (estilo OKR) y legítimamente no llevan fecha — de las 36 filas sin
// fecha, 27 eran eso. Confundirlas habría inflado el hallazgo por 6.
//
// PURO: cero red, cero DB.

/** Un paso de objetivo, mínimo para decidir si está invisible. */
export interface PasoSinFecha {
  id: string
  objectiveId: string
  title: string
  /** 'task' | 'key_result' | … — solo `task` cuenta. */
  kind: string | null
  targetDate: string | null
  status: string
  /** ISO de creación, para elegir la más vieja. */
  createdAt: string
}

export interface ObjetivoVivo {
  id: string
  title: string
  status: string
}

export interface TareaInvisible {
  id: string
  title: string
  objetivo: string
  /** Días desde que se creó. */
  dias: number
}

const DAY = 86_400_000
/** Menos de esto es una tarea recién escrita: todavía no es un olvido. */
export const DIAS_MINIMOS = 7

/**
 * La tarea invisible más vieja de un objetivo ACTIVO. PURA. null si no hay.
 *
 * Un paso cuenta solo si: es `kind: 'task'` (no un key_result), no tiene fecha,
 * sigue vivo, su objetivo está activo, y lleva al menos `DIAS_MINIMOS` sin fecha.
 */
export function tareaInvisible(
  pasos: readonly PasoSinFecha[],
  objetivos: readonly ObjetivoVivo[],
  hoy: string,
): TareaInvisible | null {
  const activos = new Map(
    (objetivos ?? []).filter((o) => o?.status === 'active').map((o) => [o.id, o.title]),
  )
  const ahora = Date.parse(`${hoy}T00:00:00Z`)
  if (!Number.isFinite(ahora)) return null

  let mejor: TareaInvisible | null = null
  for (const p of pasos ?? []) {
    if (!p?.id || !p?.title) continue
    if (p.kind !== 'task') continue
    if (p.targetDate) continue
    if (p.status === 'hecho' || p.status === 'descartado') continue
    const objetivo = activos.get(p.objectiveId)
    if (!objetivo) continue
    const creada = Date.parse(p.createdAt)
    if (!Number.isFinite(creada)) continue
    const dias = Math.round((ahora - creada) / DAY)
    if (dias < DIAS_MINIMOS) continue
    if (!mejor || dias > mejor.dias) mejor = { id: p.id, title: p.title, objetivo, dias }
  }
  return mejor
}

/**
 * La línea del brief. null si no hay nada. PURA.
 *
 * Dice CUÁNTO lleva invisible, porque ese es el dato que duele y el que explica
 * por qué nunca la vio. Y nombra el objetivo: una tarea suelta sin su objetivo no
 * se entiende fuera de contexto.
 */
export function tareaInvisibleLine(t: TareaInvisible | null | undefined): string | null {
  if (!t) return null
  const titulo = t.title.length > 60 ? `${t.title.slice(0, 59)}…` : t.title
  return `📌 "${titulo}" (${t.objetivo}) lleva ${t.dias} días sin fecha, así que nunca te la muestro. ¿Para cuándo?`
}
