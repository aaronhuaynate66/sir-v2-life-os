// SIR V2 — Slug estable de una organización. PURO.
//
// Lo usa la bandeja "¿quién es quién?" cuando Aaron marca una cuenta como página
// y crea la organización ahí mismo. El slug es la identidad de la org en todo el
// sistema (org_profiles.org_slug, nodo `org` del grafo, /empresas/[slug]), así
// que tiene que salir igual del mismo nombre siempre.

/** "RIT (CGBVP)" → "rit-cgbvp". Nunca vacío. */
export function orgSlugFromName(name: string): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'org'
}
