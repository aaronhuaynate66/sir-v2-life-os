// SIR V2 — Cross-referencing por UBICACIÓN (Clay #8).
//
// `people.location` es texto libre a nivel distrito/ciudad ("Barranco, Lima").
// Hoy nadie lo cruza. Acá lo INTERPRETAMOS: normalizamos la zona (distrito
// como token fino), agrupamos personas por zona, y surfaceamos sugerencias
// HONESTAS — sólo cuando hay match real entre 2+ personas.
//
// Límite deliberado de honestidad: SIR NO conoce la ubicación en vivo de Aaron,
// así que NUNCA afirma "estás cerca de X". Lo único que afirma es un hecho
// verificable ("estas personas viven en la misma zona") + una sugerencia
// CONDICIONAL ("si vas para allá, podés verlas de una"). Cero cercanía inventada.
//
// PURO + determinístico, cero I/O / LLM. Espejo de kinship.ts: una fuente de
// verdad para "quién comparte zona", reusable por la agenda y por el detalle.

/** Vista mínima de una persona para el cruce por zona. Subconjunto de `Person`
 *  → el motor no depende del tipo completo (testeable con objetos chicos). */
export interface ProximityPerson {
  id: string
  name: string
  slug?: string
  location?: string
  /** Importancia (0-10). Ordena a quién nombrar primero en un cluster. */
  importanceScore?: number
}

/** Zona normalizada de una ubicación de texto libre. */
export interface NormalizedZone {
  /** Clave canónica para agrupar (distrito deburr'd): "barranco". */
  key: string
  /** Etiqueta de zona tal como conviene mostrarla ("Barranco"). Preserva el
   *  casing de origen; es el token FINO (primer segmento antes de la coma). */
  label: string
  /** Ciudad / región si la ubicación traía más de un segmento ("Lima"). */
  city?: string
}

/** Cluster de personas que comparten zona (2+). */
export interface ProximityCluster {
  /** Clave de zona (distrito normalizado). */
  key: string
  /** Etiqueta de zona para UI ("Barranco"). */
  zoneLabel: string
  /** Ciudad/región de la zona, si se pudo derivar ("Lima"). */
  city?: string
  /** Personas del cluster, ordenadas por importancia desc (empate: nombre). */
  people: ProximityPerson[]
}

/** Quita acentos + baja a minúsculas + colapsa espacios. Mismo criterio que
 *  people/nameMatch (deburr) para que "Barranco" y "barránco " agrupen. */
function deburr(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Normaliza una ubicación de texto libre a una zona.
 *
 * Regla: partimos por comas. El PRIMER segmento es el token más fino (distrito
 * o, si sólo hay uno, la ciudad) → esa es la zona que agrupa. El resto se junta
 * como `city`. Agrupamos por el token fino para NO fundir "Barranco, Lima" con
 * un genérico "Lima" (distritos distintos = zonas distintas).
 *
 * Devuelve null si la ubicación está vacía o no tiene contenido útil.
 */
export function normalizeZone(raw: string | undefined | null): NormalizedZone | null {
  if (!raw) return null
  const segments = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (segments.length === 0) return null
  const label = segments[0]
  const key = deburr(label)
  if (!key) return null
  const city = segments.length > 1 ? segments.slice(1).join(', ') : undefined
  return { key, label, city }
}

function byImportanceThenName(a: ProximityPerson, b: ProximityPerson): number {
  const ia = a.importanceScore ?? 0
  const ib = b.importanceScore ?? 0
  if (ia !== ib) return ib - ia
  return a.name.localeCompare(b.name, 'es')
}

export interface ProximityOptions {
  /** Tamaño mínimo de cluster para surfacear. Default 2 (no hay "cluster" de 1). */
  minClusterSize?: number
  /** Máximo de clusters devueltos (ordenados por tamaño desc). Default sin tope. */
  maxClusters?: number
}

/**
 * Agrupa personas por zona y devuelve los clusters de 2+ personas, ordenados
 * por tamaño (más personas primero), desempate por importancia acumulada y
 * luego etiqueta de zona. Determinístico.
 *
 * Sólo entran personas con `location` normalizable. Sin match real (todas en
 * zonas distintas) → devuelve []: no inventamos cercanía.
 */
export function buildProximityClusters(
  people: ProximityPerson[],
  options: ProximityOptions = {},
): ProximityCluster[] {
  const minSize = options.minClusterSize ?? 2

  // Agrupamos por clave de zona. Guardamos la etiqueta/ciudad de la PRIMERA
  // aparición (preserva el casing tal como lo tipeó el usuario).
  const byZone = new Map<string, ProximityCluster>()
  for (const p of people) {
    const zone = normalizeZone(p.location)
    if (!zone) continue
    const existing = byZone.get(zone.key)
    if (existing) {
      existing.people.push(p)
      // Completar city si la primera no la traía pero una posterior sí.
      if (!existing.city && zone.city) existing.city = zone.city
    } else {
      byZone.set(zone.key, {
        key: zone.key,
        zoneLabel: zone.label,
        city: zone.city,
        people: [p],
      })
    }
  }

  const clusters = [...byZone.values()]
    .filter((c) => c.people.length >= minSize)
    .map((c) => ({ ...c, people: [...c.people].sort(byImportanceThenName) }))

  clusters.sort((a, b) => {
    if (a.people.length !== b.people.length) return b.people.length - a.people.length
    const impA = a.people.reduce((s, p) => s + (p.importanceScore ?? 0), 0)
    const impB = b.people.reduce((s, p) => s + (p.importanceScore ?? 0), 0)
    if (impA !== impB) return impB - impA
    return a.zoneLabel.localeCompare(b.zoneLabel, 'es')
  })

  return options.maxClusters != null ? clusters.slice(0, options.maxClusters) : clusters
}

/**
 * Personas que comparten zona con `person` (excluyéndola). Para la ficha:
 * "X vive en Barranco → estas otras también". Vacío si la persona no tiene
 * ubicación o nadie más está en su zona. Ordenadas por importancia desc.
 */
export function zoneMatesOf(
  person: ProximityPerson,
  people: ProximityPerson[],
): { zone: NormalizedZone; mates: ProximityPerson[] } | null {
  const zone = normalizeZone(person.location)
  if (!zone) return null
  const mates = people
    .filter((p) => p.id !== person.id && normalizeZone(p.location)?.key === zone.key)
    .sort(byImportanceThenName)
  if (mates.length === 0) return null
  return { zone, mates }
}
