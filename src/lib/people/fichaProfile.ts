// SIR V2 — Perfil de ficha por tipo de vínculo.
//
// La ficha se ADAPTA al tipo de relación: qué se habilita/oculta según sea
// pareja, familia, amigo, colega o lead. Antes el único gate era por género
// (una compañera de trabajo mujer veía el ciclo — sin sentido). Acá el Cuidado
// (Horizonte del ciclo + intimidad) es SOLO afectivo, y lo comercial (pipeline)
// es solo laboral/comercial. Función PURA, testeable.

import type { Person } from '@/types'
import { effectiveAmbito } from './ambito'
import type { CareBond } from '@/lib/ciclo/eventCareBrief'

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
  /** Intimidad + planner de viaje + IA a fondo. SOLO afectivo (pareja). */
  showCuidado: boolean
  /** Estudio del ciclo (2 horizontes + briefing por VÍNCULO). Toda mujer con datos. */
  showCycleForecast: boolean
  /** Registro del consejo del briefing según el vínculo. */
  careBond: CareBond
  /** Pipeline/deals como contacto + próximos pasos comerciales. Colega + lead. */
  showCommercial: boolean
}

/** Arquetipo → registro del briefing (ético): pareja=cuidado; familia/personal=
 *  presencia; colega/lead=respeto profesional. */
export function careBondFor(archetype: FichaArchetype): CareBond {
  if (archetype === 'afectivo') return 'partner'
  if (archetype === 'familiar') return 'family'
  if (archetype === 'colega' || archetype === 'lead') return 'colleague'
  return 'friend'
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
    // Intimidad/planner/IA: SOLO afectivo (pareja).
    showCuidado: archetype === 'afectivo' && hasCycle,
    // Estudio del ciclo (horizontes + briefing por vínculo): TODA MUJER con datos.
    // Decisión de Aaron (08-jul): inteligencia conductual para mejorar TODAS las
    // relaciones; el REGISTRO lo adapta careBond (respeto para colega, no romance).
    showCycleForecast: hasCycle,
    careBond: careBondFor(archetype),
    // Comercial: colega (deals internos) + lead (pipeline de venta).
    showCommercial: archetype === 'colega' || archetype === 'lead',
  }
}
