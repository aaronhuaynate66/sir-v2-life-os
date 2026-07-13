// SIR V2 — Knowledge Gap Engine (núcleo PURO). SIR proactivo: detecta lo que le
// FALTA para ayudarte y arma UNA pregunta puntual — SIEMPRE AL USUARIO, nunca a
// terceros. MVP: huecos que se AUTO-RESUELVEN al responder (rellenan un campo),
// + descarte ("no sé") persistido para no repetir.

import type { Person, Goal, SpecialDate } from '@/types'
import { effectiveAmbito } from '@/lib/people/ambito'
import { findBirthdaySpecialDate } from '@/lib/dates/birthdayDetect'
import { effectiveCadence } from '@/lib/dates/specialDates'
import { parseLocalDate } from '@/lib/dates/parseLocalDate'

export type GapKind = 'gender' | 'birthday' | 'cycle' | 'goal_next_action' | 'recurring_event'

export interface KnowledgeGap {
  /** Clave estable para descartar/no-repetir: `${kind}:${entityId}`. */
  key: string
  kind: GapKind
  /** 'person' | 'goal' — qué entidad completa la respuesta. */
  entity: 'person' | 'goal'
  entityId: string
  entityName: string
  /** La pregunta, en segunda persona, mínima. */
  question: string
  /** Campo que rellena la respuesta (para auto-resolver el hueco). */
  field: 'gender' | 'birthDate' | 'cycleStartDate' | 'nextAction' | 'specialDateCadence'
  inputType: 'date' | 'text' | 'choice' | 'confirm'
  /** Mayor = preguntar antes. */
  priority: number
  /** Solo para 'recurring_event': la fecha especial que se marcaría mensual y
   *  la cadencia propuesta. La respuesta "Sí" setea sd.cadence = proposedCadence. */
  specialDateId?: string
  proposedCadence?: 'monthly'
}

/** Detecta un candidato a hito MENSUAL ambiguo: ≥2 fechas one-time en el MISMO
 *  día-del-mes pero en meses distintos, ninguna ya marcada como recurrente. Es
 *  la señal de "parece que el día X se repite cada mes" cuando la etiqueta no lo
 *  dice (las que sí lo dicen ya se infieren monthly). PURO. Devuelve la fecha
 *  canónica a proponer (la más antigua) o null. */
export function detectMonthlyCandidate(specialDates: SpecialDate[] | undefined): SpecialDate | null {
  const byDom = new Map<number, SpecialDate[]>()
  for (const sd of specialDates ?? []) {
    if (effectiveCadence(sd) !== 'once') continue // ya es recurrente (o inferida)
    const parsed = parseLocalDate(sd.date)
    if (!parsed) continue
    const dom = parsed.getDate()
    const arr = byDom.get(dom) ?? []
    arr.push(sd)
    byDom.set(dom, arr)
  }
  for (const [, arr] of byDom) {
    // Meses distintos (no el mismo evento repetido el mismo mes/año).
    const months = new Set(arr.map((s) => (parseLocalDate(s.date)!.getMonth() + '-' + parseLocalDate(s.date)!.getFullYear())))
    if (arr.length >= 2 && months.size >= 2) {
      // Canónica = la más antigua (ancla del hito).
      return [...arr].sort((a, b) => a.date.localeCompare(b.date))[0]
    }
  }
  return null
}

const firstName = (n: string) => (n || '').trim().split(/\s+/)[0] || n

/**
 * Detecta huecos de conocimiento sobre data que YA existe. Determinístico.
 * Excluye los `dismissed` (descartados con "no sé"). Orden: prioridad desc.
 */
export function detectGaps(
  people: Person[],
  goals: Goal[],
  dismissed: Set<string> = new Set(),
): KnowledgeGap[] {
  const out: KnowledgeGap[] = []
  const push = (g: KnowledgeGap) => { if (!dismissed.has(g.key)) out.push(g) }

  for (const p of people) {
    const imp = Number(p.importanceScore) || 0
    const ambito = effectiveAmbito(p)
    // Género faltante: es un dato de bajísima fricción (un toque) que DESTRABA
    // la inteligencia conductual/ciclo (fichaProfile.showCycleForecast). Sin él,
    // motores enteros quedan dormidos. Se pregunta en vínculos que importan
    // (≥5/10) o personales/familiares. Máxima prioridad: es la llave de lo demás.
    if (!p.gender && (imp >= 5 || ambito === 'personal')) {
      push({
        key: `gender:${p.id}`, kind: 'gender', entity: 'person', entityId: p.id,
        entityName: p.name, question: `¿${firstName(p.name)} es hombre o mujer?`,
        field: 'gender', inputType: 'choice', priority: 70 + imp,
      })
    }
    // Cumpleaños faltante en un vínculo que importa (≥6/10). Aplica a TODOS los
    // ámbitos — pero el PARA QUÉ cambia: en personal es afecto; en colega/lead
    // es estratégico (un saludo posiciona, entra en su mente). Distinto dato no,
    // distinto encuadre sí. Personal pesa un poco más (afecto > táctica).
    // El cumple se da por conocido si hay birth_date (con año) O una fecha
    // especial de cumpleaños (año-menos, camino honesto sin inventar edad). Así
    // el gap se apaga guardes el año o no.
    const hasBirthday = !!p.birthDate || !!findBirthdaySpecialDate(p.specialDates, p.name)
    if (imp >= 6 && !hasBirthday) {
      const comercial = ambito === 'lead' || ambito === 'colega'
      push({
        key: `birthday:${p.id}`, kind: 'birthday', entity: 'person', entityId: p.id,
        entityName: p.name,
        question: comercial
          ? `¿Cuándo cumple ${firstName(p.name)}? Un saludo de cumpleaños lo posiciona.`
          : `¿Cuándo cumple ${firstName(p.name)}?`,
        field: 'birthDate', inputType: 'date', priority: (comercial ? 25 : 40) + imp,
      })
    }
    // Hito MENSUAL ambiguo: SIR detecta el patrón (varias fechas el mismo día
    // del mes) y PREGUNTA si se repite cada mes. Si Aaron confirma, lo marca
    // recurrente y desde ahí lo recuerda. Idea de Aaron: no hardcodear, detectar
    // + preguntar. Las que ya dicen "mensual/mes de relación" se infieren solas.
    const monthlyCand = detectMonthlyCandidate(p.specialDates)
    if (monthlyCand) {
      const dom = parseLocalDate(monthlyCand.date)?.getDate()
      push({
        key: `recurring_event:${p.id}:${monthlyCand.id}`, kind: 'recurring_event',
        entity: 'person', entityId: p.id, entityName: p.name,
        question: `Veo varias fechas de ${firstName(p.name)} el ${dom} del mes ("${monthlyCand.label}"). ¿Es un aniversario que se repite cada mes? Lo marco y te lo recuerdo.`,
        field: 'specialDateCadence', inputType: 'confirm', priority: 45 + imp,
        specialDateId: monthlyCand.id, proposedCadence: 'monthly',
      })
    }
    // Ciclo faltante (mujer) → habilita el panel de ciclo (caso Diana).
    if (p.gender === 'female' && !p.cycleStartDate && ambito === 'personal') {
      push({
        key: `cycle:${p.id}`, kind: 'cycle', entity: 'person', entityId: p.id,
        entityName: p.name, question: `Para seguir el ciclo de ${firstName(p.name)}, ¿cuándo empezó su último período?`,
        field: 'cycleStartDate', inputType: 'date', priority: 35 + imp,
      })
    }
  }

  for (const g of goals) {
    if (g.status !== 'active') continue
    if (!(g.nextAction ?? '').trim()) {
      push({
        key: `goal_next_action:${g.id}`, kind: 'goal_next_action', entity: 'goal', entityId: g.id,
        entityName: g.title, question: `¿Cuál es el próximo paso de "${g.title}"?`,
        field: 'nextAction', inputType: 'text', priority: g.isAnchor ? 60 : 30,
      })
    }
  }

  return out.sort((a, b) => b.priority - a.priority)
}
