// SIR V2 — Consolidación PURA de varias capturas del perfil propio.
//
// El usuario sube N screenshots (distintas secciones de su LinkedIn/Instagram).
// Cada una pasa por Visión y produce un SelfProfileExtracted; acá los fusionamos
// en UNO solo, determinísticamente:
//   - tags (roles/skills/interests): UNIÓN deduplicada (case-insensitive).
//   - textos (fullName/location/bio/trajectory): el MÁS LARGO (más completo).
//   - confidence: la más alta presente.
//   - imageLegible: OR (alguna legible alcanza).
//   - source: la red mayoritaria entre las que no son 'unknown'.
//
// Testeado en consolidate.test.ts.

import type { Confidence } from '@/lib/capture/observations/types'
import type { SelfProfileExtracted, SelfProfileSource } from './types'
import { SELF_PROFILE_MAX_TAGS } from './types'

const CONF_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 }

function mergeTags(lists: string[][]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of lists) {
    for (const v of list) {
      const key = v.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(v)
      if (out.length >= SELF_PROFILE_MAX_TAGS) return out
    }
  }
  return out
}

function longest(values: (string | null)[]): string | null {
  let best: string | null = null
  for (const v of values) {
    if (v && (!best || v.length > best.length)) best = v
  }
  return best
}

/** Primer valor no-nulo (para campos donde "más largo" no aplica, ej. fecha). */
function firstDefined(values: (string | null)[]): string | null {
  for (const v of values) if (v) return v
  return null
}

function dominantSource(items: SelfProfileExtracted[]): SelfProfileSource {
  const counts: Record<SelfProfileSource, number> = { linkedin: 0, instagram: 0, unknown: 0 }
  for (const it of items) counts[it.source] += 1
  if (counts.linkedin === 0 && counts.instagram === 0) return 'unknown'
  return counts.linkedin >= counts.instagram ? 'linkedin' : 'instagram'
}

/**
 * Fusiona N extracciones en una. Devuelve null si la lista está vacía. Con un
 * solo item lo devuelve tal cual (idempotente).
 */
export function consolidateSelfProfiles(
  items: SelfProfileExtracted[],
): SelfProfileExtracted | null {
  if (items.length === 0) return null
  if (items.length === 1) return items[0]

  let confidence: Confidence = 'low'
  for (const it of items) {
    if (CONF_RANK[it.confidence] > CONF_RANK[confidence]) confidence = it.confidence
  }

  return {
    source: dominantSource(items),
    fullName: longest(items.map((i) => i.fullName)),
    birthDate: firstDefined(items.map((i) => i.birthDate)),
    roles: mergeTags(items.map((i) => i.roles)),
    location: longest(items.map((i) => i.location)),
    skills: mergeTags(items.map((i) => i.skills)),
    interests: mergeTags(items.map((i) => i.interests)),
    bio: longest(items.map((i) => i.bio)),
    trajectory: longest(items.map((i) => i.trajectory)),
    imageLegible: items.some((i) => i.imageLegible),
    confidence,
    rawObservations: longest(items.map((i) => i.rawObservations)),
  }
}
