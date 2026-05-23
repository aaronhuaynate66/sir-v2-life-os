// SIR V2 — Relationship Engine
import type { Person, Relationship } from '@/types'
import type { RelationshipContext, RelationshipAlert, RelationshipMap } from './types'

export function analyzeRelationshipContext(person: Person, relationship: Relationship): RelationshipContext {
  const days = person.lastContact
    ? Math.floor((Date.now() - new Date(person.lastContact).getTime()) / (1000 * 60 * 60 * 24))
    : 999
  return {
    person, relationship,
    recentActivity: [],
    pendingActions: relationship.nextAction ? [relationship.nextAction] : [],
    alertLevel: person.importanceScore >= 8 && days > 14 ? 'high' : relationship.status === 'strained' ? 'high' : days > 30 ? 'medium' : 'none',
    nextContactRecommendation: days > 7 && person.importanceScore >= 8 ? 'Contactar esta semana' : undefined,
    relationshipHealthScore: Math.max(0, Math.min(10, 7 - (relationship.status === 'strained' ? 3 : 0) - (days > 30 ? 1 : 0) + (person.energyImpact === 'energizing' ? 1 : 0))),
  }
}

export function detectRelationshipAlerts(persons: Person[], relationships: Relationship[]): RelationshipAlert[] {
  const alerts: RelationshipAlert[] = []
  persons.forEach(person => {
    const rel = relationships.find(r => r.personId === person.id)
    if (!rel) return
    const days = person.lastContact
      ? Math.floor((Date.now() - new Date(person.lastContact).getTime()) / (1000 * 60 * 60 * 24))
      : 999
    if (person.importanceScore >= 8 && days > 14) {
      alerts.push({
        personId: person.id, personName: person.name,
        alertType: 'no_contact',
        message: `No has contactado a ${person.name} en ${days} dias`,
        urgency: days > 30 ? 'immediate' : 'soon',
        suggestedAction: `Envia un mensaje breve a ${person.name}`,
      })
    }
    if (rel.status === 'strained') {
      alerts.push({
        personId: person.id, personName: person.name,
        alertType: 'conflict',
        message: `La relacion con ${person.name} esta en tension`,
        urgency: 'immediate',
        suggestedAction: 'Evaluar si es momento de abordar la tension',
      })
    }
  })
  return alerts.sort((a, b) => ({ immediate: 0, soon: 1, monitor: 2 }[a.urgency] - { immediate: 0, soon: 1, monitor: 2 }[b.urgency]))
}

export function buildRelationshipMap(persons: Person[]): RelationshipMap {
  return {
    innerCircle: persons.filter(p => p.category === 'inner_circle'),
    close: persons.filter(p => p.category === 'close'),
    network: persons.filter(p => p.category === 'network'),
    peripheral: persons.filter(p => p.category === 'peripheral'),
    needsAttention: persons.filter(p => {
      const days = p.lastContact ? Math.floor((Date.now() - new Date(p.lastContact).getTime()) / 86400000) : 999
      return p.importanceScore >= 7 && days > 21
    }),
  }
}
