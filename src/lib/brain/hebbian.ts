// SIR V2 — Cerebro F3 · Hebbian (bucle de aprendizaje).
//
// "Confirmar" (reinforce) sube el delta aprendido de una arista; "descartar"
// (discard) lo baja. El delta vive en `edge_weights` (mig 0106) y se suma al
// peso base derivado por el projector (F1). F2 y F4 leen el peso total; el
// aprendizaje modula, no reescribe la base.
//
// Clamp con bandas asimetricas por diseno:
//  - Piso: -baseWeight  → el peso total no baja de 0 (una arista muy
//    descartada queda inerte pero no propaga energia negativa).
//  - Techo: baseWeight * 2 → una arista muy confirmada pesa hasta 3x su base
//    (base + 2 * base). Por encima diverge sin senal nueva.
//
// Determinista, sin IA. Se testea sin infra.

/** Magnitud por default del feedback: cuanto suma un ↑ y cuanto resta una ✕. */
export const DEFAULT_MAGNITUDE = 1

export type FeedbackAction = 'reinforce' | 'discard'

export interface ApplyFeedbackInput {
  /** Delta actual guardado en edge_weights (0 si no hay fila aun). */
  currentDelta: number
  action: FeedbackAction
  /** Peso base derivado del kind (BASE_WEIGHT[kind]). Se usa para clampear. */
  baseWeight: number
  /** Cuanto suma/resta por evento. Default DEFAULT_MAGNITUDE. */
  magnitude?: number
}

/** Aplica un feedback y devuelve el NUEVO delta, clamped. Puro. */
export function applyFeedback(input: ApplyFeedbackInput): number {
  const mag = input.magnitude ?? DEFAULT_MAGNITUDE
  const step = input.action === 'reinforce' ? mag : -mag
  const raw = input.currentDelta + step
  const floor = -input.baseWeight
  const ceil = input.baseWeight * 2
  if (raw < floor) return floor
  if (raw > ceil) return ceil
  return raw
}

/** Parsea un edgeKey `srcType:srcId:dstType:dstId:kind` a sus partes. Devuelve
 *  null si el formato es invalido (defensivo contra input arbitrario del
 *  cliente). ATENCION: id puede tener ":" dentro (uuids no, pero por si acaso)
 *  — mantenemos la lectura por posicion fija: tipos y kind son enums cortos
 *  sin ":", el id es lo que queda en el medio. */
export function parseEdgeKey(key: string): {
  srcType: string
  srcId: string
  dstType: string
  dstId: string
  kind: string
} | null {
  const parts = key.split(':')
  if (parts.length < 5) return null
  const srcType = parts[0]
  const dstType = parts[parts.length - 3]
  const kind = parts[parts.length - 1]
  const dstId = parts[parts.length - 2]
  // srcId = todo lo que quede entre srcType y dstType.
  const srcId = parts.slice(1, parts.length - 3).join(':')
  if (!srcType || !srcId || !dstType || !dstId || !kind) return null
  return { srcType, srcId, dstType, dstId, kind }
}
