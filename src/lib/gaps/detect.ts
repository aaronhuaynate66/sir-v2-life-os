// SIR V2 — Knowledge Gap Engine (núcleo PURO). SIR proactivo: detecta lo que le
// FALTA para ayudarte y arma UNA pregunta puntual — SIEMPRE AL USUARIO, nunca a
// terceros. MVP: huecos que se AUTO-RESUELVEN al responder (rellenan un campo),
// + descarte ("no sé") persistido para no repetir.

import type { Person, Goal } from '@/types'
import { effectiveAmbito } from '@/lib/people/ambito'
import { findBirthdaySpecialDate } from '@/lib/dates/birthdayDetect'

export type GapKind = 'gender' | 'birthday' | 'cycle' | 'goal_next_action'

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
  field: 'gender' | 'birthDate' | 'cycleStartDate' | 'nextAction'
  inputType: 'date' | 'text' | 'choice'
  /** Mayor = preguntar antes. */
  priority: number
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
