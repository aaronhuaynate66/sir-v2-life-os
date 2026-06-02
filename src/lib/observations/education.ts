// SIR V2 — Reconciliación de EDUCACIÓN entre fuentes.
//
// Una persona puede tener dos orígenes para "educación":
//   1. `people.education` (texto libre, migration 0024). Suele venir del nivel
//      de registro / RENIEC ("Superior (2do año)") o de carga manual.
//   2. La observation `linkedin` más reciente (`data.latestEducation`), que es
//      MÁS rica: institución + carrera + rango de años
//      ("Business Administration · Universidad Marcelino Champagnat · 2018-2020").
//
// Antes se mostraban AMBAS, contradiciéndose (el "2do año" de RENIEC arriba y
// la universidad real de LinkedIn más abajo). Regla de negocio: para EDUCACIÓN,
// LinkedIn tiene PRECEDENCIA sobre el nivel de registro. RENIEC sigue mandando
// para identidad legal (nombres, DNI) — eso no se toca acá; sólo educación
// cambia de fuente. El nivel de registro se conserva como dato SECUNDARIO
// claramente etiquetado para no perder la procedencia.
//
// Función PURA y determinística (sin LLM, sin I/O): testeable y reusable tanto
// en el render (VidaProfesional) como en cualquier write-back futuro.

import type { LinkedInOrgRef } from '../capture/linkedin/types'

/** De dónde salió el dato de educación que se muestra. */
export type EducationSource = 'linkedin' | 'registro'

export interface ReconciledEducationLine {
  /** Texto a mostrar (ya formateado). */
  value: string
  /** Sub-línea opcional (ej. rango de años "2018 - 2020" de LinkedIn). */
  hint: string | null
  /** Fuente del dato, para etiquetar la procedencia en la UI. */
  source: EducationSource
}

export interface ReconciledEducation {
  /** Línea principal (la que manda). LinkedIn tiene precedencia sobre el nivel
   *  de registro/RENIEC. null si no hay ningún dato de educación. */
  primary: ReconciledEducationLine | null
  /** Nivel de registro (RENIEC) conservado como dato secundario etiquetado,
   *  SÓLO cuando LinkedIn ganó y el registro aporta algo distinto. null si no
   *  hay que mostrarlo (no hay registro, ya es la primaria, o es redundante). */
  secondary: ReconciledEducationLine | null
}

/** Formatea una entrada de educación de LinkedIn como "Carrera · Institución"
 *  (o sólo la institución si no se leyó la carrera). Mismo criterio que el
 *  render histórico de VidaProfesional/PerfilProfesional. */
export function formatLinkedInEducation(edu: LinkedInOrgRef): string {
  const name = edu.name.trim()
  const title = edu.title?.trim()
  return title ? `${title} · ${name}` : name
}

/** Normaliza para comparar redundancia (case/espacios-insensible). */
function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Reconcilia el campo `people.education` (registro/RENIEC o manual) con la
 * educación extraída de LinkedIn, aplicando precedencia de LinkedIn.
 *
 * @param manualEducation  `person.education` (texto libre). null/'' si no hay.
 * @param linkedinEducation `data.latestEducation` de la observation linkedin.
 */
export function reconcileEducation(
  manualEducation: string | null | undefined,
  linkedinEducation: LinkedInOrgRef | null | undefined,
): ReconciledEducation {
  const registro = typeof manualEducation === 'string' ? manualEducation.trim() : ''
  // Sólo consideramos LinkedIn si trae institución legible (mismo guard que orgRef).
  const li =
    linkedinEducation && typeof linkedinEducation.name === 'string' && linkedinEducation.name.trim()
      ? linkedinEducation
      : null

  if (li) {
    const value = formatLinkedInEducation(li)
    const primary: ReconciledEducationLine = {
      value,
      hint: li.dateRange?.trim() || null,
      source: 'linkedin',
    }
    // El registro queda como secundario salvo que sea redundante con lo de
    // LinkedIn (mismo texto normalizado) o esté vacío.
    const secondary: ReconciledEducationLine | null =
      registro && norm(registro) !== norm(value)
        ? { value: registro, hint: null, source: 'registro' }
        : null
    return { primary, secondary }
  }

  // Sin dato de LinkedIn → el nivel de registro es la única fuente disponible.
  if (registro) {
    return { primary: { value: registro, hint: null, source: 'registro' }, secondary: null }
  }

  return { primary: null, secondary: null }
}
