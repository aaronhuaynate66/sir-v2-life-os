// SIR V2 — Registro de organizaciones: mapa empresa → holding/grupo.
//
// POR QUÉ: la pertenencia a un holding (K2 ⊂ Grupo HNG) es un hecho sobre la
// ORGANIZACIÓN, casi nunca presente en el perfil de cada persona. Sin esto,
// alguien cuyo LinkedIn dice solo "Gerente en K2" quedaría sin grupo y no
// conectaría con nadie. El registro resuelve el grupo a partir del empleador.
//
// SEMBRADO desde el perfil de Alex Heilbrunn (su bio lista las filiales del
// Grupo HNG). Editable a mano; es la semilla del futuro "entidad-empresa".
//
// PURO. Conservador: ante la duda, NO inventa grupo (devuelve undefined).

/** Normaliza un nombre de organización para comparar. */
export function normalizeOrgName(value: string | null | undefined): string {
  if (typeof value !== 'string') return ''
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Una entrada del registro: el grupo canónico + los tokens de empresa que le
 *  pertenecen (normalizados). El match es por token de palabra contenido. */
interface OrgGroupEntry {
  /** Etiqueta canónica del grupo (como se muestra y se usa de clave de unión). */
  group: string
  /** Tokens de empresa miembro (normalizados). Si el nombre del empleador
   *  contiene alguno como secuencia, pertenece al grupo. */
  members: string[]
}

/** Registro semilla. Grupo HNG (holding familiar Heilbrunn & Navarro-Grau) y
 *  sus filiales según el perfil de Alex. Ampliable. */
export const ORG_GROUP_REGISTRY: OrgGroupEntry[] = [
  {
    group: 'Grupo HNG',
    members: [
      'grupo hng',
      'hng corporación',
      'hng corporacion',
      'k2 seguridad',
      'k2 seguridad y resguardo',
      'concrefab',
      'facilita',
      'malvitec',
      'refriperú',
      'refriperu',
      'reforestadora ghl',
      'uayki',
      'escuela de refrigeración',
      'escuela de refrigeracion',
      'procity',
    ],
  },
]

/** Resuelve el grupo/holding de un empleador, o undefined si no se conoce.
 *  Match conservador: el nombre normalizado del empleador debe CONTENER un
 *  token miembro (o viceversa para nombres muy cortos como "k2"). */
export function resolveOrgGroup(organization: string | null | undefined): string | undefined {
  const org = normalizeOrgName(organization)
  if (!org) return undefined
  for (const entry of ORG_GROUP_REGISTRY) {
    for (const member of entry.members) {
      if (member.length === 0) continue
      // El empleador contiene el token miembro: "k2 seguridad y resguardo" ⊃ "k2 seguridad".
      if (org.includes(member)) return entry.group
      // O el empleador es el grupo mismo ("grupo hng" ⊂ "grupo hng corporación s.a.c.").
      if (member.includes(org) && org.length >= 3) return entry.group
    }
  }
  return undefined
}
