// SIR V2 — Fixtures Iniciales
import type { Person, Relationship, Goal, Signal, SleepRecord, SelfMetric, FinancialMovement, Recommendation } from '@/types'

export const fixturePeople: Person[] = [
  { id: 'person_001', name: 'Marco Rodriguez', alias: 'Marco', relationship: 'friend', category: 'inner_circle', importanceScore: 9, energyImpact: 'energizing', trustLevel: 9, lastContact: new Date(Date.now() - 18*86400000).toISOString(), contactFrequency: 'weekly', location: 'Lima', tags: ['mentor','business'], notes: 'Amigo de anos. Confianza maxima.', createdAt: '2024-01-01T00:00:00Z', updatedAt: new Date().toISOString() },
  { id: 'person_002', name: 'Sofia Vega', alias: 'Sofia', relationship: 'professional', category: 'close', importanceScore: 7, energyImpact: 'neutral', trustLevel: 6, lastContact: new Date(Date.now() - 5*86400000).toISOString(), contactFrequency: 'weekly', location: 'Lima', tags: ['cliente'], notes: 'Cliente potencial de alto valor.', createdAt: '2024-06-01T00:00:00Z', updatedAt: new Date().toISOString() },
  { id: 'person_003', name: 'Papa', relationship: 'family', category: 'inner_circle', importanceScore: 10, energyImpact: 'energizing', trustLevel: 10, lastContact: new Date(Date.now() - 7*86400000).toISOString(), contactFrequency: 'weekly', location: 'Cusco', tags: ['familia'], notes: 'Referente de vida.', createdAt: '2024-01-01T00:00:00Z', updatedAt: new Date().toISOString() },
]

export const fixtureRelationships: Relationship[] = [
  { id: 'rel_001', personId: 'person_001', type: 'friend', status: 'active', depth: 9, reciprocity: 0.1, history: [{ id: 'evt_001', description: 'Conversacion estrategica', emotionalTone: 0.8, date: new Date(Date.now() - 30*86400000).toISOString(), type: 'positive' }], sharedGoals: ['goal_001'], tensions: [], strengths: ['confianza'], nextAction: 'Actualizar sobre progreso K2' },
  { id: 'rel_002', personId: 'person_002', type: 'professional', status: 'active', depth: 5, reciprocity: 0.2, history: [], sharedGoals: ['goal_002'], tensions: ['expectativas no alineadas'], strengths: ['profesionalismo'], nextAction: 'Enviar propuesta' },
]

export const fixtureGoals: Goal[] = [
  { id: 'goal_001', title: 'Independencia Financiera Fase 1', description: 'Construir ingresos pasivos', category: 'financial', priority: 'critical', status: 'active', targetDate: '2025-12-31', progress: 23, milestones: [{ id: 'm1', title: 'Primer ingreso pasivo', completed: true, completedAt: '2024-09-01' }, { id: 'm2', title: 'Ingreso cubre 30% gastos', completed: false }], relatedGoals: [], relatedPersons: ['person_001'], peaceImpact: 9, obstacles: ['tiempo limitado'], nextAction: 'Cerrar deal con Sofia esta semana', createdAt: '2024-01-01T00:00:00Z', updatedAt: new Date().toISOString() },
  { id: 'goal_002', title: 'Cerrar Contrato Sofia Vega', description: 'Primer contrato de consultoria', category: 'career', priority: 'high', status: 'active', targetDate: new Date(Date.now() + 14*86400000).toISOString().split('T')[0], progress: 45, milestones: [{ id: 'm3', title: 'Enviar propuesta', completed: false }, { id: 'm4', title: 'Contrato firmado', completed: false }], relatedGoals: ['goal_001'], relatedPersons: ['person_002'], peaceImpact: 6, obstacles: ['propuesta no enviada'], nextAction: 'Enviar propuesta hoy', createdAt: '2024-11-01T00:00:00Z', updatedAt: new Date().toISOString() },
]

export const fixtureSignals: Signal[] = [
  { id: 'signal_001', source: 'linkedin', type: 'opportunity', content: 'Sofia Vega publico sobre busqueda de consultores', strength: 8, urgency: 'soon', relatedPersons: ['person_002'], relatedGoals: ['goal_002'], meaning: 'Timing favorable para enviar propuesta ahora', actionRequired: true, suggestedAction: 'Enviar propuesta en las proximas 48h', detectedAt: new Date(Date.now() - 2*86400000).toISOString(), expiresAt: new Date(Date.now() + 5*86400000).toISOString(), resolved: false },
  { id: 'signal_002', source: 'biological', type: 'biological', content: 'Sueno promedio: 5.8h', strength: 7, urgency: 'soon', relatedPersons: [], relatedGoals: [], meaning: 'Deuda de sueno acumulandose', actionRequired: true, suggestedAction: 'Priorizar 8h de sueno esta noche', detectedAt: new Date().toISOString(), resolved: false },
  { id: 'signal_003', source: 'relational', type: 'relational', content: 'No has contactado a Marco en 18 dias', strength: 6, urgency: 'soon', relatedPersons: ['person_001'], relatedGoals: [], meaning: 'Silencio inusual en inner circle', actionRequired: true, suggestedAction: 'Envia mensaje breve hoy', detectedAt: new Date().toISOString(), resolved: false },
]

export const fixtureSleepRecords: SleepRecord[] = [
  { id: 'sl1', date: new Date(Date.now() - 3*86400000).toISOString().split('T')[0], bedtime: '23:30', wakeTime: '07:30', duration: 8.0, quality: 8 },
  { id: 'sl2', date: new Date(Date.now() - 2*86400000).toISOString().split('T')[0], bedtime: '01:30', wakeTime: '07:00', duration: 5.5, quality: 5 },
  { id: 'sl3', date: new Date(Date.now() - 1*86400000).toISOString().split('T')[0], bedtime: '23:00', wakeTime: '07:00', duration: 8.0, quality: 7 },
]

export const fixtureMetrics: SelfMetric[] = [
  { id: 'm1', category: 'energy', value: 5, timestamp: new Date(Date.now() - 2*86400000).toISOString() },
  { id: 'm2', category: 'stress', value: 7, timestamp: new Date(Date.now() - 2*86400000).toISOString() },
  { id: 'm3', category: 'energy', value: 7, timestamp: new Date(Date.now() - 86400000).toISOString() },
  { id: 'm4', category: 'stress', value: 5, timestamp: new Date(Date.now() - 86400000).toISOString() },
  { id: 'm5', category: 'energy', value: 6, timestamp: new Date().toISOString() },
  { id: 'm6', category: 'stress', value: 5, timestamp: new Date().toISOString() },
]

export const fixtureFinancialMovements: FinancialMovement[] = [
  { id: 'f1', type: 'income', amount: 3500, currency: 'PEN', exchangeRate: 1.0, amountPEN: 3500, category: 'business', description: 'Consultoria', date: '2024-11-01', recurrent: false, tags: [] },
  { id: 'f2', type: 'expense', amount: 900, currency: 'PEN', exchangeRate: 1.0, amountPEN: 900, category: 'housing', description: 'Alquiler', date: '2024-11-05', recurrent: true, recurrentPeriod: 'monthly', tags: ['fijo'] },
  { id: 'f3', type: 'expense', amount: 400, currency: 'PEN', exchangeRate: 1.0, amountPEN: 400, category: 'food', description: 'Alimentacion', date: '2024-11-15', recurrent: false, tags: [] },
  { id: 'f4', type: 'expense', amount: 150, currency: 'PEN', exchangeRate: 1.0, amountPEN: 150, category: 'transport', description: 'Transporte', date: '2024-11-15', recurrent: false, tags: [] },
  { id: 'f5', type: 'investment', amount: 500, currency: 'PEN', exchangeRate: 1.0, amountPEN: 500, category: 'investment', description: 'ETF mensual', date: '2024-11-20', recurrent: true, recurrentPeriod: 'monthly', tags: ['inversion'] },
]

export const fixtureRecommendation: Recommendation = {
  id: 'rec_initial_001', title: 'Enviar propuesta a Sofia hoy',
  description: 'Senal LinkedIn favorable. Deal conecta con objetivo financiero critico.',
  type: 'action', priority: 'high', timing: 'today',
  relatedGoals: ['goal_002', 'goal_001'], relatedPersons: ['person_002'],
  expectedPeaceImpact: 2, confidence: 0.85,
  reasoning: 'Senal LinkedIn activa + objetivo en riesgo + energia estable',
  createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), status: 'pending',
}

export const allFixtures = { people: fixturePeople, relationships: fixtureRelationships, goals: fixtureGoals, signals: fixtureSignals, sleepRecords: fixtureSleepRecords, metrics: fixtureMetrics, financialMovements: fixtureFinancialMovements, recommendation: fixtureRecommendation }

export { fixtureMemories } from './memories'
