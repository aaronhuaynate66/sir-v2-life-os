// SIR V2 — Knowledge Gap Engine · superficie INLINE (en el chat de SIR).
//
// La mitad que le faltaba a SIR: antes de responder una pregunta, si le falta
// UNA pieza clave para responder BIEN —y la pregunta es del TIPO que esa pieza
// cambiaría— SIR pregunta primero, en vez de adivinar. SIEMPRE a Aaron, NUNCA a
// terceros (= guardrail ADR 0009). Determinístico, sin llamadas extra de IA.
//
// A diferencia del panel ambiente ([[detect.ts]] → "SIR quiere saber"), acá la
// pregunta solo aparece si es MATERIAL a la consulta actual: no interrumpe con
// el cumpleaños de alguien si Aaron preguntó por su próximo paso de un objetivo.

import type { Person, Goal } from '@/types'
import { detectGaps, type KnowledgeGap } from './detect'

function norm(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * ¿La pregunta es del TIPO que este hueco cambiaría la respuesta? Por palabras
 * clave, por tipo de hueco. Para huecos de persona exige además que la persona
 * esté NOMBRADA en la pregunta (no preguntar de la nada).
 */
const GOAL_TITLE_STOP = new Set([
  'como', 'cliente', 'clientes', 'nuevo', 'nueva', 'para', 'sobre', 'desde', 'hasta',
  'cuando', 'donde', 'cada', 'todo', 'toda', 'todos', 'mejor', 'mejorar', 'mas',
  'cosa', 'tema', 'parte', 'forma', 'cosas', 'recurrente', 'mensual', 'anual',
])

export function gapMatchesIntent(gap: KnowledgeGap, question: string): boolean {
  const q = norm(question)
  const firstName = norm(gap.entityName.split(/\s+/)[0] || '')
  const mentionsPerson = firstName.length >= 3 && q.includes(firstName)

  switch (gap.kind) {
    case 'cycle': {
      // El ciclo cambia cómo leer su ánimo/estado/distancia/qué le conviene.
      const kw = [
        'como esta', 'como anda', 'como la veo', 'animo', 'humor', 'distante',
        'rara', 'molesta', 'enojada', 'triste', 'sensible', 'que le pasa',
        'por que esta', 'le escribo', 'le hablo', 'que le digo', 'ciclo',
        'periodo', 'regla', 'menstrual',
      ]
      return mentionsPerson && kw.some((k) => q.includes(k))
    }
    case 'birthday': {
      const kw = ['cumple', 'cumpleanos', 'regalo', 'saludo', 'saludar', 'detalle', 'agasaj', 'felicit']
      return mentionsPerson && kw.some((k) => q.includes(k))
    }
    case 'goal_next_action': {
      // Pregunta sobre AVANZAR ese objetivo (por título o por "objetivo").
      // Filtra palabras COMUNES del título (como/cliente/nuevo…) para no matchear
      // por ruido (bug: "Cerrar X como cliente" matcheaba "¿cómo voy?").
      const titleTokens = norm(gap.entityName).split(/\s+/).filter((t) => t.length >= 4 && !GOAL_TITLE_STOP.has(t))
      const mentionsGoal = titleTokens.some((t) => q.includes(t)) || q.includes('objetivo') || q.includes('meta')
      const kw = [
        'que hago', 'que deberia hacer', 'proximo paso', 'siguiente paso',
        'como avanzo', 'como sigo', 'como voy', 'que sigue', 'avanzar',
        'como progreso', 'arranco', 'empiezo', 'por donde',
      ]
      return mentionsGoal && kw.some((k) => q.includes(k))
    }
    default:
      return false
  }
}

/**
 * Elige UN hueco para preguntar inline ANTES de responder, o null si ninguno es
 * relevante. Recibe SOLO las entidades objetivo (las que la pregunta toca) para
 * no interrumpir con huecos de gente no mencionada. detectGaps ya ordena por
 * prioridad, así que el primero relevante es el de mayor prioridad.
 */
export function selectInlineGap(
  question: string,
  targetPeople: Person[],
  targetGoals: Goal[],
  dismissed: Set<string> = new Set(),
): KnowledgeGap | null {
  const gaps = detectGaps(targetPeople, targetGoals, dismissed)
  for (const g of gaps) {
    if (gapMatchesIntent(g, question)) return g
  }
  return null
}


// ─── CAPA CONTEXTUAL ────────────────────────────────────────────────────────
// A diferencia de los huecos de CAMPO (cumple/ciclo/próximo paso), un hueco
// CONTEXTUAL es una SITUACIÓN que SIR no conoce y que cambia el consejo —p.ej.
// si Aaron pregunta "¿le escribo?" y lo último que SIR sabe de esa persona fue
// una interacción tensa, falta saber si ya hablaron después. La respuesta es
// EFÍMERA: se re-inyecta en esa pregunta, NO se guarda como dato permanente
// (mañana la situación cambió). Determinístico, sobre señales que SIR ya tiene.

export interface ContextualGap {
  key: string
  kind: 'post_conflict_contact' | 'stale_knowledge' | 'deal_stalled' | 'deal_no_ticket'
  entity: 'person' | 'deal'
  entityId: string
  entityName: string
  question: string
  inputType: 'text'
  /** La respuesta NO persiste un campo: se re-inyecta como contexto de la consulta. */
  ephemeral: true
}

export interface ContextualSignal {
  id: string
  name: string
  /** Calidad (1-5) de la interacción conocida más RECIENTE, o null si no hay. */
  latestInteractionQuality: number | null
  latestInteractionAt: string | null
  /** Importancia del vínculo (1-10). Para gatear 'conocimiento viejo'. */
  importance?: number
}

const CONTACT_INTENT = [
  'le escribo', 'le hablo', 'que le digo', 'que le escribo', 'me acerco',
  'la llamo', 'lo llamo', 'le mando', 'le escribir', 'escribirle', 'hablarle',
  'deberia escribir', 'deberia hablar', 'retomo', 'retomar', 'la contacto',
  'lo contacto', 'le contesto', 'le respondo',
]

// Intención de consejo/estado sobre la persona (no solo contacto): habilita el
// hueco de "conocimiento viejo".
const ADVICE_INTENT = [
  ...CONTACT_INTENT,
  'como esta', 'como anda', 'como va', 'como voy', 'voy con', 'como sigue', 'que hago con', 'que sabes de',
  'contame de', 'que onda con', 'como la veo', 'como lo veo', 'que tal', 'novedad',
  'como esta la cosa con', 'que pasa con',
]
const STALE_DAYS = 30

function daysBetween(fromISO: string, now: Date): number {
  const t = new Date(fromISO).getTime()
  if (!Number.isFinite(t)) return NaN
  return Math.floor((now.getTime() - t) / 86_400_000)
}

/**
 * Detecta UN hueco contextual material a la consulta, o null. Hoy cubre el caso
 * insignia: intención de contacto sobre alguien cuya última interacción conocida
 * fue tensa (quality<=2) → "¿hablaron después?". Determinístico.
 */
export function detectContextualGap(
  question: string,
  signals: ContextualSignal[],
  dismissed: Set<string> = new Set(),
  now: Date = new Date(),
): ContextualGap | null {
  const q = norm(question)
  const hasContactIntent = CONTACT_INTENT.some((k) => q.includes(k))
  const hasAdviceIntent = ADVICE_INTENT.some((k) => q.includes(k))
  if (!hasAdviceIntent) return null

  for (const s of signals) {
    const first = norm((s.name || '').split(/\s+/)[0] || '')
    if (!(first.length >= 3 && q.includes(first))) continue

    // (1) Post-conflicto: intención de CONTACTO + última interacción tensa.
    if (hasContactIntent && s.latestInteractionQuality != null && s.latestInteractionQuality <= 2) {
      const key = `ctx_postconflict:${s.id}`
      if (!dismissed.has(key)) {
        return {
          key, kind: 'post_conflict_contact', entity: 'person', entityId: s.id,
          entityName: s.name,
          question: `Lo último que tengo con ${first} fue una interacción tensa. ¿Hablaron después de eso?`,
          inputType: 'text', ephemeral: true,
        }
      }
    }

    // (2) Conocimiento viejo: vínculo importante (>=6) del que no sé nada hace
    //     >30 días → puede haber pasado algo que cambia el consejo.
    const imp = Number(s.importance) || 0
    if (imp >= 6 && s.latestInteractionAt) {
      const d = daysBetween(s.latestInteractionAt, now)
      if (Number.isFinite(d) && d >= STALE_DAYS) {
        const key = `ctx_stale:${s.id}`
        if (!dismissed.has(key)) {
          return {
            key, kind: 'stale_knowledge', entity: 'person', entityId: s.id,
            entityName: s.name,
            question: `Lo último que tengo de ${first} es de hace ${d} días. ¿Pasó algo nuevo con ${first} desde entonces?`,
            inputType: 'text', ephemeral: true,
          }
        }
      }
    }
  }
  return null
}


export interface DealSignal {
  id: string
  title: string
  /** Primer nombre del contacto del deal (para matchear por persona). */
  contactFirst: string | null
  status: string            // open|won|lost|paused
  nextAction: string | null
  nextActionDate: string | null  // YYYY-MM-DD
  updatedAt: string | null        // ISO
  amount: number | null           // ticket; null/0 = sin cargar
  stage: string                   // lead|reunion|relevamiento|propuesta|negociacion|...
}

const DEAL_WORDS = ['oportunidad', 'deal', 'lead', 'cliente', 'negocio', 'propuesta', 'cuenta', 'venta', 'licitacion', 'licitación']
const DEAL_STALE_DAYS = 14

/**
 * ¿Hay un deal ABIERTO, estancado y mencionado en la consulta? Estancado =
 * sin próximo paso, o con próximo paso VENCIDO, o sin novedad hace >14 días.
 * Mencionado = por título, por el contacto, o por palabra genérica de deal +
 * intención de estado/consejo. Pregunta efímera (no persiste).
 */
export function detectDealGap(
  question: string,
  deals: DealSignal[],
  dismissed: Set<string> = new Set(),
  now: Date = new Date(),
): ContextualGap | null {
  const q = norm(question)
  if (!ADVICE_INTENT.some((k) => q.includes(k)) && !DEAL_WORDS.some((k) => q.includes(k))) return null
  const todayISO = now.toISOString().slice(0, 10)
  for (const d of deals) {
    if (d.status !== 'open') continue
    const titleTokens = norm(d.title).split(/\s+/).filter((t) => t.length >= 4)
    const byTitle = titleTokens.some((t) => q.includes(t))
    const byContact = !!d.contactFirst && norm(d.contactFirst).length >= 3 && q.includes(norm(d.contactFirst))
    const byGeneric = DEAL_WORDS.some((k) => q.includes(k))
    if (!(byTitle || byContact || byGeneric)) continue

    const noNext = !(d.nextAction ?? '').trim()
    const overdue = !!d.nextActionDate && d.nextActionDate < todayISO
    const staleUpdate = !!d.updatedAt && Number.isFinite(daysBetween(d.updatedAt.slice(0, 10), now)) && daysBetween(d.updatedAt.slice(0, 10), now) >= DEAL_STALE_DAYS
    if (noNext || overdue || staleUpdate) {
      const key = `ctx_dealstalled:${d.id}`
      if (!dismissed.has(key)) {
        const why = noNext ? 'no le tengo próximo paso' : overdue ? 'el próximo paso quedó vencido' : 'no registro novedad hace rato'
        return {
          key, kind: 'deal_stalled', entity: 'deal', entityId: d.id,
          entityName: d.title,
          question: `Con "${d.title}" ${why}. ¿Avanzó algo o sigue igual?`,
          inputType: 'text', ephemeral: true,
        }
      }
    }
    // Ticket sin cargar: SOLO en etapas avanzadas (propuesta/negociación), donde
    // ya tendrías un número. En lead/reunión/relevamiento el monto aún no se sabe
    // (proceso B2B: reunión → técnica → propuesta) → no molestar.
    const advanced = d.stage === 'propuesta' || d.stage === 'negociacion'
    if (advanced && !(d.amount != null && d.amount > 0)) {
      const key = `ctx_dealticket:${d.id}`
      if (!dismissed.has(key)) {
        return {
          key, kind: 'deal_no_ticket', entity: 'deal', entityId: d.id,
          entityName: d.title,
          question: `No tengo cargado el ticket de "${d.title}". ¿De cuánto sería, aprox?`,
          inputType: 'text', ephemeral: true,
        }
      }
    }
  }
  return null
}
