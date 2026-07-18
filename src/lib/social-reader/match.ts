// SIR V2 — Matcheo captura social → persona (Parte A, PURO y testeable).
//
// Resuelve una captura de IG/LinkedIn a una persona de SIR por: handle de IG,
// slug de LinkedIn, o —clave para el auto-bootstrap— por NOMBRE cuando la persona
// aún no tiene linkedin_url. Así, con solo ver el perfil de un contacto, SIR lo
// matchea por nombre y RELLENA su linkedin_url solo (ver la ruta), sin que Aaron
// tenga que cargar URLs a mano.

export interface PersonLite {
  id: string
  name: string
  instagramHandle: string | null
  linkedinUrl: string | null
  title: string | null
}

export interface SocialMatchItem {
  platform: string
  handle?: string
  linkedinUrl?: string
  name?: string
}

export type MatchedBy = 'ig_handle' | 'li_slug' | 'name'

export interface PersonMatch {
  person: PersonLite
  matchedBy: MatchedBy
}

/** Handle IG canónico: sin @, minúsculas, sin espacios. */
export function canonHandle(h: string): string {
  return h.trim().replace(/^@/, '').toLowerCase()
}

/** Slug de una URL/handle de LinkedIn (linkedin.com/in/<slug>), minúsculas. */
export function linkedinSlug(v: string): string | null {
  if (!v) return null
  const m = v.match(/\/in\/([^/?#\s]+)/i) || v.match(/^([A-Za-z0-9\-_%.]+)$/)
  return m ? m[1].replace(/\/+$/, '').toLowerCase() : null
}

/** Nombre normalizado para match: minúsculas, sin tildes, espacios colapsados. */
export function normName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export interface PersonIndex {
  ig: Map<string, PersonLite>
  liSlug: Map<string, PersonLite>
  name: Map<string, PersonLite>
}

/** Indexa las personas para matcheo O(1). Si un nombre se repite, se ignora en el
 *  índice de nombres (ambiguo → no arriesgamos un match por nombre erróneo). */
export function buildPersonIndex(people: PersonLite[]): PersonIndex {
  const ig = new Map<string, PersonLite>()
  const liSlug = new Map<string, PersonLite>()
  const nameCount = new Map<string, number>()
  const name = new Map<string, PersonLite>()
  for (const p of people) {
    if (p.instagramHandle) ig.set(canonHandle(p.instagramHandle), p)
    if (p.linkedinUrl) { const s = linkedinSlug(p.linkedinUrl); if (s) liSlug.set(s, p) }
    const n = normName(p.name)
    if (n) { nameCount.set(n, (nameCount.get(n) ?? 0) + 1); name.set(n, p) }
  }
  // Sacamos del índice de nombres los ambiguos (mismo nombre en ≥2 personas).
  for (const [n, c] of nameCount) if (c > 1) name.delete(n)
  return { ig, liSlug, name }
}

/** Resuelve una captura a una persona. Orden: handle IG / slug LinkedIn exactos;
 *  si no, por nombre (para el bootstrap de LinkedIn sin URL). null si no matchea. */
export function matchPerson(index: PersonIndex, item: SocialMatchItem): PersonMatch | null {
  if (item.platform === 'instagram' && item.handle) {
    const p = index.ig.get(canonHandle(item.handle))
    return p ? { person: p, matchedBy: 'ig_handle' } : null
  }
  if (item.platform === 'linkedin') {
    const slug = item.linkedinUrl ? linkedinSlug(item.linkedinUrl) : null
    if (slug) { const p = index.liSlug.get(slug); if (p) return { person: p, matchedBy: 'li_slug' } }
    if (item.name) { const p = index.name.get(normName(item.name)); if (p) return { person: p, matchedBy: 'name' } }
  }
  return null
}
