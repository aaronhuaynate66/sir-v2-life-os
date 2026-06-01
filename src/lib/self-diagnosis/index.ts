// SIR V2 — Espacio personal / diagnóstico: helpers puros.
//
// Lógica determinística, sin red ni IA. La data de diagnóstico es PERSONAL y
// SENSIBLE: estos helpers solo la modelan/normalizan en memoria; nunca la
// envían a ningún lado. Testeado en index.test.ts.

import type { SelfDiagnosis } from '@/types'

/** Las claves de SelfDiagnosis que son listas (text[]). */
export const DIAGNOSIS_LIST_KEYS = [
  'anxieties',
  'blocks',
  'stoppedTolerating',
  'understandings',
  'anchors',
] as const

/** Las claves de SelfDiagnosis que son texto libre largo. */
export const DIAGNOSIS_TEXT_KEYS = [
  'emotionalState',
  'idealLifeVision',
  'futureSelf',
] as const

/**
 * Diagnóstico vacío. El id se genera una sola vez (cliente) y se reusa en cada
 * edición (upsert por id), igual que m_/sl_/h_. updatedAt = epoch para marcar
 * "nunca editado".
 */
export function emptyDiagnosis(id: string): SelfDiagnosis {
  return {
    id,
    emotionalState: '',
    anxieties: [],
    blocks: [],
    stoppedTolerating: [],
    understandings: [],
    anchors: [],
    idealLifeVision: '',
    futureSelf: '',
    updatedAt: new Date(0).toISOString(),
  }
}

/** ¿El diagnóstico no tiene NADA escrito? (para mostrar el empty-state). */
export function isDiagnosisEmpty(d: SelfDiagnosis | null | undefined): boolean {
  if (!d) return true
  const textEmpty = DIAGNOSIS_TEXT_KEYS.every((k) => d[k].trim() === '')
  const listsEmpty = DIAGNOSIS_LIST_KEYS.every((k) => d[k].length === 0)
  return textEmpty && listsEmpty
}

/** Cuántos campos (texto + listas) tienen contenido — para un mini "completitud". */
export function countFilledFields(d: SelfDiagnosis | null | undefined): number {
  if (!d) return 0
  const texts = DIAGNOSIS_TEXT_KEYS.filter((k) => d[k].trim() !== '').length
  const lists = DIAGNOSIS_LIST_KEYS.filter((k) => d[k].length > 0).length
  return texts + lists
}

/** Total de campos que componen el diagnóstico (texto + listas). */
export const DIAGNOSIS_TOTAL_FIELDS = DIAGNOSIS_TEXT_KEYS.length + DIAGNOSIS_LIST_KEYS.length

/**
 * Normaliza un draft a una entidad lista para persistir: recorta textos, limpia
 * ítems de lista vacíos/espacios y deduplica. Devuelve una copia (no muta).
 */
export function normalizeDiagnosis(draft: SelfDiagnosis): SelfDiagnosis {
  const cleanList = (xs: string[]): string[] => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const raw of xs) {
      const v = raw.trim()
      if (v === '' || seen.has(v)) continue
      seen.add(v)
      out.push(v)
    }
    return out
  }
  return {
    id: draft.id,
    emotionalState: draft.emotionalState.trim(),
    anxieties: cleanList(draft.anxieties),
    blocks: cleanList(draft.blocks),
    stoppedTolerating: cleanList(draft.stoppedTolerating),
    understandings: cleanList(draft.understandings),
    anchors: cleanList(draft.anchors),
    idealLifeVision: draft.idealLifeVision.trim(),
    futureSelf: draft.futureSelf.trim(),
    updatedAt: draft.updatedAt,
  }
}
