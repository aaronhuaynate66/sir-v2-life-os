import { describe, it, expect } from 'vitest'
import {
  RELATIONSHIP_TYPE_LABEL,
  PERSON_CATEGORY_LABEL,
  ENERGY_IMPACT_LABEL,
  RELATIONSHIP_STATUS_LABEL,
  ALERT_URGENCY_LABEL,
  relationshipTypeLabel,
  personCategoryLabel,
  energyImpactLabel,
  relationshipStatusLabel,
  alertUrgencyLabel,
} from './labels'
import type {
  RelationshipType,
  PersonCategory,
  EnergyImpact,
  RelationshipStatus,
} from '@/types'

describe('people labels — traducción de enums al español', () => {
  it('traduce los tipos de vínculo que aparecían crudos en la UI', () => {
    expect(relationshipTypeLabel('romantic')).toBe('Pareja')
    expect(relationshipTypeLabel('family')).toBe('Familia')
    expect(relationshipTypeLabel('friend')).toBe('Amigo/a')
  })

  it('traduce los círculos/tiers que aparecían crudos en la UI', () => {
    expect(personCategoryLabel('inner_circle')).toBe('Círculo íntimo')
    expect(personCategoryLabel('close')).toBe('Cercano')
    expect(personCategoryLabel('peripheral')).toBe('Periférico')
    expect(personCategoryLabel('network')).toBe('Red')
  })

  it('traduce el impacto energético (neutral se mantiene)', () => {
    expect(energyImpactLabel('energizing')).toBe('Energizante')
    expect(energyImpactLabel('draining')).toBe('Drenante')
    expect(energyImpactLabel('neutral')).toBe('Neutral')
  })

  it('traduce el estado de la relación y la urgencia de alerta', () => {
    expect(relationshipStatusLabel('strained')).toBe('Tensa')
    expect(relationshipStatusLabel('active')).toBe('Activa')
    expect(alertUrgencyLabel('immediate')).toBe('Inmediata')
    expect(alertUrgencyLabel('soon')).toBe('Pronto')
    expect(alertUrgencyLabel('monitor')).toBe('Monitorear')
  })

  it('cubre TODOS los valores del enum (sin huecos ni undefined)', () => {
    const relationshipTypes: RelationshipType[] = [
      'family', 'friend', 'romantic', 'professional', 'mentor', 'mentee', 'acquaintance',
    ]
    const categories: PersonCategory[] = ['inner_circle', 'close', 'network', 'peripheral']
    const energies: EnergyImpact[] = ['energizing', 'draining', 'neutral']
    const statuses: RelationshipStatus[] = ['active', 'dormant', 'strained', 'ended']
    const urgencies = ['immediate', 'soon', 'monitor'] as const

    for (const v of relationshipTypes) expect(RELATIONSHIP_TYPE_LABEL[v]).toBeTruthy()
    for (const v of categories) expect(PERSON_CATEGORY_LABEL[v]).toBeTruthy()
    for (const v of energies) expect(ENERGY_IMPACT_LABEL[v]).toBeTruthy()
    for (const v of statuses) expect(RELATIONSHIP_STATUS_LABEL[v]).toBeTruthy()
    for (const v of urgencies) expect(ALERT_URGENCY_LABEL[v]).toBeTruthy()
  })

  it('no deja texto en inglés en ninguna etiqueta', () => {
    const all = [
      ...Object.values(RELATIONSHIP_TYPE_LABEL),
      ...Object.values(PERSON_CATEGORY_LABEL),
      ...Object.values(ENERGY_IMPACT_LABEL),
      ...Object.values(RELATIONSHIP_STATUS_LABEL),
      ...Object.values(ALERT_URGENCY_LABEL),
    ]
    // "Network" / "romantic" / "inner_circle" eran los crudos reportados.
    expect(all).not.toContain('Network')
    expect(all).not.toContain('romantic')
    expect(all).not.toContain('inner_circle')
  })
})
