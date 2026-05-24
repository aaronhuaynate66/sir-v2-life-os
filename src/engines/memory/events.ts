// SIR V2 - Memory Events
// Funciones puras que convierten eventos del sistema en objetos Memory
import type { Memory, Person, Signal, SleepRecord, SelfMetric, FinancialMovement, Goal } from '@/types'

// ─── createPersonAddedMemory ──────────────────────────────

export function createPersonAddedMemory(person: Person): Memory {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    type: 'relational',
    title: `Nueva persona registrada: ${person.name}`,
    content: `Se agrego a ${person.name}${person.alias ? ` (${person.alias})` : ''} como ${person.relationship} en la categoria ${person.category}. Impacto energetico: ${person.energyImpact}. Nivel de confianza: ${person.trustLevel}/10.`,
    entities: [person.id, person.name],
    emotionalCharge: person.energyImpact === 'energizing' ? 7 : person.energyImpact === 'draining' ? 3 : 5,
    importance: Math.min(10, Math.round(person.importanceScore)),
    timestamp: now,
    lastAccessed: now,
    decayRate: 0.05,
    tags: ['persona', person.relationship, person.category, ...person.tags.slice(0, 3)],
    relatedMemories: [],
  }
}

// ─── createSignalAddedMemory ──────────────────────────────

function signalUrgencyToImportance(urgency: Signal['urgency']): number {
  if (urgency === 'immediate') return 9
  if (urgency === 'soon') return 7
  if (urgency === 'monitor') return 5
  return 3
}

export function createSignalAddedMemory(signal: Signal): Memory {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    type: 'predictive',
    title: `Senal detectada: ${signal.type} desde ${signal.source}`,
    content: `${signal.content}${signal.meaning ? ` Significado: ${signal.meaning}` : ''}${signal.suggestedAction ? ` Accion sugerida: ${signal.suggestedAction}` : ''}`,
    entities: [...signal.relatedPersons, ...signal.relatedGoals],
    emotionalCharge: Math.min(10, Math.round(signal.strength * 10)),
    importance: signalUrgencyToImportance(signal.urgency),
    timestamp: signal.detectedAt,
    lastAccessed: now,
    decayRate: signal.urgency === 'immediate' ? 0.02 : 0.1,
    tags: ['senal', signal.source, signal.type, signal.urgency],
    relatedMemories: [],
  }
}

// ─── createSleepMemory ────────────────────────────────────────────

export function createSleepMemory(record: SleepRecord): Memory {
  const now = new Date().toISOString()
  const qualityLabel = record.quality >= 8 ? 'excelente' : record.quality >= 6 ? 'buena' : record.quality >= 4 ? 'regular' : 'mala'
  return {
    id: crypto.randomUUID(),
    type: 'temporal',
    title: `Sueno del ${record.date}: ${record.duration}h, calidad ${record.quality}/10`,
    content: `Dormido a las ${record.bedtime}, despertado a las ${record.wakeTime}. Duracion: ${record.duration} horas. Calidad ${qualityLabel} (${record.quality}/10).${record.dreams ? ` Suenos: ${record.dreams}` : ''}${record.notes ? ` Notas: ${record.notes}` : ''}`,
    entities: [],
    emotionalCharge: record.quality >= 7 ? 6 : record.quality >= 4 ? 4 : 2,
    importance: record.quality >= 8 ? 6 : record.quality >= 5 ? 4 : 7,
    timestamp: new Date(record.date).toISOString(),
    lastAccessed: now,
    decayRate: 0.15,
    tags: ['sueno', 'salud', qualityLabel, `calidad-${record.quality}`],
    relatedMemories: [],
  }
}

// ─── createSelfMetricMemory ────────────────────────────────────────

function metricCategoryToEmotional(category: SelfMetric['category']): number {
  if (category === 'mood' || category === 'motivation' || category === 'confidence') return 6
  if (category === 'stress') return 4
  return 5
}

export function createSelfMetricMemory(metric: SelfMetric): Memory {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    type: 'temporal',
    title: `Metrica de ${metric.category}: ${metric.value}/10`,
    content: `Registro de ${metric.category} con valor ${metric.value}/10.${metric.note ? ` Nota: ${metric.note}` : ''}`,
    entities: [],
    emotionalCharge: metricCategoryToEmotional(metric.category),
    importance: metric.value <= 3 || metric.value >= 9 ? 7 : 4,
    timestamp: metric.timestamp,
    lastAccessed: now,
    decayRate: 0.2,
    tags: ['metrica', metric.category, `valor-${metric.value}`],
    relatedMemories: [],
  }
}

// ─── createFinancialMovementMemory ───────────────────────────

function movementTypeToImportance(type: FinancialMovement['type']): number {
  if (type === 'investment' || type === 'debt') return 8
  if (type === 'income') return 7
  if (type === 'expense') return 5
  return 4
}

export function createFinancialMovementMemory(movement: FinancialMovement): Memory {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    type: 'semantic',
    title: `Movimiento financiero: ${movement.type} de ${movement.amount} ${movement.currency}`,
    content: `${movement.description}. Tipo: ${movement.type}, categoria: ${movement.category}, monto: ${movement.amount} ${movement.currency}.${movement.recurrent ? ` Recurrente${movement.recurrentPeriod ? ` (${movement.recurrentPeriod})` : ''}.` : ''}${movement.relatedGoal ? ` Objetivo relacionado: ${movement.relatedGoal}.` : ''}`,
    entities: movement.relatedGoal ? [movement.relatedGoal] : [],
    emotionalCharge: movement.type === 'income' || movement.type === 'investment' ? 7 : movement.type === 'debt' ? 3 : 5,
    importance: movementTypeToImportance(movement.type),
    timestamp: new Date(movement.date).toISOString(),
    lastAccessed: now,
    decayRate: 0.1,
    tags: ['finanzas', movement.type, movement.category, movement.currency, ...movement.tags.slice(0, 2)],
    relatedMemories: [],
  }
}

// ─── createGoalProgressMemory ─────────────────────────────────────

export function createGoalProgressMemory(
  goal: Goal,
  previousProgress: number,
  newProgress: number,
): Memory {
  const now = new Date().toISOString()
  const delta = newProgress - previousProgress
  const completed = newProgress >= 100
  const nextMilestone = goal.milestones.find((m) => !m.completed)
  return {
    id: crypto.randomUUID(),
    type: 'episodic',
    title: completed
      ? `Objetivo completado: ${goal.title}`
      : `Progreso en objetivo: ${goal.title} (${previousProgress}% → ${newProgress}%)`,
    content: `El objetivo "${goal.title}" paso de ${previousProgress}% a ${newProgress}% (${delta >= 0 ? '+' : ''}${delta}%). Prioridad: ${goal.priority}. Estado: ${goal.status}.${nextMilestone ? ` Proximo hito: ${nextMilestone.title}.` : ''}${goal.nextAction ? ` Proxima accion: ${goal.nextAction}` : ''}`,
    entities: [goal.id, ...goal.relatedPersons, ...goal.relatedGoals],
    emotionalCharge: completed ? 9 : delta >= 10 ? 7 : delta >= 0 ? 5 : 3,
    importance: goal.priority === 'critical' ? 9 : goal.priority === 'high' ? 7 : goal.priority === 'medium' ? 5 : 3,
    timestamp: now,
    lastAccessed: now,
    decayRate: completed ? 0.02 : 0.08,
    tags: ['objetivo', goal.category, goal.priority, goal.status, completed ? 'completado' : 'progreso'],
    relatedMemories: [],
  }
}
