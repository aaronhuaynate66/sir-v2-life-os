// SIR V2 — Perfil de ficha por tipo de vínculo.
//
// La ficha se ADAPTA al tipo de relación: qué se habilita/oculta según sea
// pareja, familia, amigo, colega o lead. Antes el único gate era por género
// (una compañera de trabajo mujer veía el ciclo — sin sentido). Acá el Cuidado
// (Horizonte del ciclo + intimidad) es SOLO afectivo, y lo comercial (pipeline)
// es solo laboral/comercial. Función PURA, testeable.

import type { Person } from '@/types'
import { effectiveAmbito } from './ambito'

export type FichaArchetype = 'afectivo' | 'familiar' | 'personal' | 'colega' | 'lead'

export const ARCHETYPE_LABEL: Record<FichaArchetype, string> = {
  afectivo: 'Afectivo',
  familiar: 'Familia',
  personal: 'Personal',
  colega: 'Colega',
  lead: 'Comercial',
}

export interface FichaProfile {
  archetype: FichaArchetype
  label: string
  /** Horizonte del ciclo + intimidad + timing de cuidado. Solo afectivo con ciclo. */
  showCuidado: boolean
  /** Pipeline/deals como contacto + próximos pasos comerciales. Colega + lead. */
  showCommercial: boolean
}

type FichaInput = Pick<Person, 'relationship' | 'ambito' | 'gender' | 'cycleStartDate'>

/** Clasifica el arquetipo del vínculo a partir de relación + ámbito. */
export function fichaArchetype(p: FichaInput): FichaArchetype {
  if (p.relationship === 'romantic') return 'afectivo'
  if (p.relationship === 'family') return 'familiar'
  const amb = effectiveAmbito(p)
  if (amb === 'lead') return 'lead'
  if (amb === 'colega') return 'colega'
  return 'personal'
}

export function fichaProfile(p: FichaInput): FichaProfile {
  const archetype = fichaArchetype(p)
  const hasCycle = p.gender === 'female' || !!p.cycleStartDate
  return {
    archetype,
    label: ARCHETYPE_LABEL[archetype],
    // Cuidado/ciclo: SOLO afectivo (pareja). Una colega mujer ya no lo ve.
    showCuidado: archetype === 'afectivo' && hasCycle,
    // Comercial: colega (deals internos) + lead (pipeline de venta).
    showCommercial: archetype === 'colega' || archetype === 'lead',
  }
}
