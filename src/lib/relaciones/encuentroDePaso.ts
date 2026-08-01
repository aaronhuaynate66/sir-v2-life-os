// SIR V2 — Un PASO DE OBJETIVO también puede ser un encuentro. PURO.
//
// ═══ POR QUÉ EXISTE ═══════════════════════════════════════════════════════════
//
// #1062 hizo que SIR pregunte "ayer viste a X, ¿cómo te fue?" cuando un encuentro
// AGENDADO no dejó registro. Pero solo miraba `personal_events`.
//
// Y el caso que originó todo se le escapaba por el costado: la conversación de
// fondo con Diana del 31-jul 19:15 estaba cargada como PASO DE OBJETIVO, no como
// evento. O sea, el detector no agarraba el hecho que lo motivó. Aaron tuvo que
// contarlo a mano —exactamente el trabajo manual que pidió eliminar: *"un método
// más eficiente que te inyecte cada vez que tenga una conversación"*.
//
// ═══ EL PROBLEMA DE ATRIBUCIÓN ════════════════════════════════════════════════
//
// La persona NO cuelga del paso: cuelga del OBJETIVO (`goals.related_persons`).
// El objetivo de la relación tiene 14 pasos y UNA sola persona vinculada (Diana),
// así que atribuir la persona a todos los pasos convertiría "Asistir a primera
// sesión de terapia individual" en un encuentro con Diana. Falso, e incómodo.
//
// Por eso se exige que **el nombre de la persona aparezca en el título del paso**.
// Es una condición dura y verificable, no una inferencia. Prefiere callarse antes
// que preguntar por un encuentro que nunca fue con esa persona.
//
// PURO: cero red, cero DB.

import type { EncuentroPasado } from './pedirRegistro'

/** Un paso de objetivo, con la fecha en que tocaba. */
export interface PasoDeObjetivo {
  objectiveId: string
  title: string
  /** 'YYYY-MM-DD'. */
  targetDate: string
}

/** Personas vinculadas a un objetivo (`goals.related_persons`). */
export interface PersonasDeObjetivo {
  objectiveId: string
  personIds: readonly string[]
}

/** Verbos que denotan un ENCUENTRO real (presencial o de voz). */
const VERBOS_ENCUENTRO = [
  'conversar', 'conversación', 'conversacion', 'hablar', 'sostener',
  'reunirse', 'reunión', 'reunion', 'juntarse', 'encontrarse', 'encuentro',
  'ver a', 'verse', 'visitar', 'visita', 'cita con',
  'llamar', 'llamada', 'almorzar', 'almuerzo', 'cenar', 'cena', 'café', 'cafe',
  'salir con', 'quedar con',
]

// Verbos de PREPARACIÓN: el paso habla DE un encuentro pero no ES el encuentro.
// Sacados de sus pasos reales, que traían los dos casos pegados:
//   "Escribir lista de necesidades antes de la conversación"  → preparar
//   "Agendar primera conversación cara a cara con Diana"      → agendar
//   "Sostener la primera conversación con Diana"              → ESTE sí
// Sin este filtro, un mismo encuentro se preguntaría tres veces.
const VERBOS_PREPARACION = [
  'escribir', 'preparar', 'agendar', 'planificar', 'planear', 'definir',
  'identificar', 'listar', 'anotar', 'revisar', 'leer', 'buscar', 'investigar',
  'pensar', 'decidir', 'elegir', 'redactar', 'armar', 'coordinar',
]

/** Sin tildes y en minúsculas, para comparar. PURA.
 *  Usa \p{Diacritic} en vez de un rango literal de combinantes: pegados crudos
 *  en el fuente son invisibles y cualquier editor se los puede comer. */
function normalizar(s: string): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

/** ¿El título describe un encuentro que YA debió ocurrir? PURA. */
export function esEncuentro(title: string): boolean {
  const t = normalizar(title)
  if (!t) return false
  // La primera palabra manda: "Agendar conversación…" es agendar, no conversar.
  const primera = t.trim().split(/\s+/)[0]
  if (VERBOS_PREPARACION.some((v) => normalizar(v) === primera)) return false
  return VERBOS_ENCUENTRO.some((v) => t.includes(normalizar(v)))
}

/** ¿El título nombra a esta persona? Basta el primer nombre. PURA. */
export function nombraA(title: string, personName: string): boolean {
  const primer = normalizar(personName).trim().split(/\s+/)[0]
  if (!primer || primer.length < 3) return false
  return new RegExp(`(?<![a-z])${primer}(?![a-z])`).test(normalizar(title))
}

/**
 * Pasos de objetivo que califican como encuentros con una persona. PURO.
 *
 * Las tres condiciones son AND, y todas duras:
 *   1. el objetivo tiene esa persona vinculada,
 *   2. el título describe un encuentro (y no su preparación),
 *   3. el título NOMBRA a la persona.
 *
 * El `status` del paso NO se mira a propósito. El caso real es justamente el
 * contrario: la conversación con Diana ocurrió el 31-jul y el paso seguía en
 * `pendiente` a la mañana siguiente — filtrar por `hecho` habría perdido el
 * único caso que este módulo existe para agarrar.
 */
export function encuentrosDePasos(
  pasos: readonly PasoDeObjetivo[],
  personasPorObjetivo: readonly PersonasDeObjetivo[],
  nombrePorId: ReadonlyMap<string, string>,
): EncuentroPasado[] {
  const porObjetivo = new Map<string, readonly string[]>()
  for (const p of personasPorObjetivo ?? []) {
    if (p?.objectiveId) porObjetivo.set(p.objectiveId, p.personIds ?? [])
  }

  const out: EncuentroPasado[] = []
  for (const paso of pasos ?? []) {
    if (!paso?.title || !paso?.targetDate) continue
    if (!esEncuentro(paso.title)) continue
    for (const personId of porObjetivo.get(paso.objectiveId) ?? []) {
      const personName = nombrePorId.get(personId)
      if (!personName || !nombraA(paso.title, personName)) continue
      out.push({
        personId,
        personName,
        date: String(paso.targetDate).slice(0, 10),
        title: paso.title,
      })
    }
  }
  return out
}
