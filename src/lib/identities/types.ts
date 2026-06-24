// SIR V2 — Identidades / alias por red (tipos + normalización pura).
export const IDENTITY_NETWORKS = ['whatsapp', 'instagram', 'twitter', 'linkedin', 'phone', 'other'] as const
export type IdentityNetwork = (typeof IDENTITY_NETWORKS)[number]

export const NETWORK_LABEL: Record<IdentityNetwork, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  twitter: 'Twitter/X',
  linkedin: 'LinkedIn',
  phone: 'Teléfono',
  other: 'Otra',
}

export interface PersonIdentity {
  id: string
  personId: string
  network: IdentityNetwork
  identifier: string
}

export function isNetwork(v: unknown): v is IdentityNetwork {
  return typeof v === 'string' && (IDENTITY_NETWORKS as readonly string[]).includes(v)
}

/** Normaliza un identificador para match exacto e insensible: sin acentos,
 *  minúsculas, sin símbolos (salvo + de teléfono), espacios colapsados. Igual
 *  criterio que la huella de chat para que "Papa" == "papá" == "PAPA". */
export function normIdentifier(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface RawIdentityRow { id: string; person_id: string; network: string; identifier: string }
export function mapIdentityRow(r: RawIdentityRow): PersonIdentity {
  return {
    id: r.id,
    personId: r.person_id,
    network: isNetwork(r.network) ? r.network : 'other',
    identifier: r.identifier,
  }
}
