'use client'

// SIR V2 — RelationshipGraph (ego-graph radial de la ficha de persona).
//
// La persona de la ficha va al CENTRO; sus `person_links` salen radialmente
// como nodos (SVG puro, layout radial calculado a mano — sin librerías de grafo).
// Debajo, un bloque "Estructura" tipo lista que agrupa los vínculos por dominio
// (Familia / Profesional / Personal / Yo), el equivalente a reports-to / peers /
// direct-reports pero con las relaciones REALES de Aaron.
//
// Convenciones REUSADAS (no se inventa nada nuevo):
//  - Colores por dominio: tokens `--graph-*` (globals.css) vía CATEGORY_TOKEN.
//    Se usan como `hsl(var(--graph-*))` en el `style` inline del SVG → siguen el
//    tema claro/oscuro automáticamente (CSS re-evalúa al togglear .dark), sin el
//    truco de re-leer getComputedStyle que necesita el canvas de /red.
//  - Etiquetas de rol: KIND_LABEL / inverseRoleLabel (familia) y PRO_KIND_LABEL /
//    inverseProKindLabel (profesional/social), igual que FamiliaPanel y
//    ProfessionalLinksPanel. Los `kind` fuera de enum (data real: colega_hng,
//    gerente_de_area_de…) caen a un prettify honesto (no se fabrica un inverso).
//  - Datos REALES del store (people + personLinks), como los paneles hermanos.

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Share2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { useRelationshipStore } from '@/stores'
import { useMounted } from '@/hooks/useMounted'
import type { Person, FamilyKind, ProfessionalKind } from '@/types'
import type { GraphCategory } from '@/lib/graph/types'
import { CATEGORY_TOKEN, CATEGORY_LABEL } from '@/lib/graph/colors'
import { initialsFromName, firstName } from '@/lib/graph/builder'
import { SELF_ID, KIND_LABEL, inverseRoleLabel } from '@/lib/relationships/family'
import { PRO_KIND_LABEL, inverseProKindLabel } from '@/lib/relationships/professional'

const FAMILY_KINDS = new Set(Object.keys(KIND_LABEL))
const PRO_KINDS = new Set(Object.keys(PRO_KIND_LABEL))

/** `hsl(var(--graph-x))` — resuelto por CSS, así que es theme-aware nativo. */
const token = (cat: GraphCategory) => `hsl(var(${CATEGORY_TOKEN[cat]}))`

/** `colega_hng` → "Colega HNG"; `gerente_de_area_de` → "Gerente de área de". */
function prettyKind(kind: string): string {
  const s = kind
    .replace(/_/g, ' ')
    .replace(/\barea\b/gi, 'área')
    .trim()
  if (!s) return 'Vínculo'
  const up = s.toUpperCase()
  // Siglas frecuentes: mantenerlas en mayúsculas.
  if (up === s && s.length <= 4) return up
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Etiqueta del rol. `inverse` = la ficha es el destino (personB) → rol invertido
 *  para los kinds conocidos; para los desconocidos devolvemos el mismo texto
 *  (no inventamos un inverso que no podemos calcular). */
function roleLabelFor(kind: string, inverse: boolean): string {
  if (FAMILY_KINDS.has(kind)) {
    return inverse ? inverseRoleLabel(kind as FamilyKind) : KIND_LABEL[kind as FamilyKind]
  }
  if (PRO_KINDS.has(kind)) {
    return inverse ? inverseProKindLabel(kind as ProfessionalKind) : PRO_KIND_LABEL[kind as ProfessionalKind]
  }
  return prettyKind(kind)
}

/** Dominio (color) del vínculo. Prioriza `category`; para filas viejas con
 *  category null cae al `kind`: familiar conocido → familia, resto → profesional. */
function categoryForLink(
  linkCategory: string | null | undefined,
  kind: string,
  otherIsSelf: boolean,
): GraphCategory {
  if (otherIsSelf) return 'self'
  if (linkCategory === 'profesional') return 'profesional'
  if (linkCategory === 'social') return 'personal'
  if (linkCategory === 'familia') return 'familia'
  if (FAMILY_KINDS.has(kind)) return 'familia'
  return 'profesional'
}

interface Connection {
  key: string
  /** slug para deep-link; undefined para self o persona sin slug. */
  slug?: string
  name: string
  initials: string
  short: string
  isSelf: boolean
  category: GraphCategory
  roleLabel: string
}

// Geometría del SVG (unidades internas; el viewBox lo escala responsivo).
const W = 600
const CY = 232
const CX = W / 2
const NODE_R = 24
const SELF_R = 32

/** Orden de las secciones de "Estructura" (dominios). */
const SECTION_ORDER: GraphCategory[] = [
  'self',
  'familia',
  'profesional',
  'personal',
  'networking',
  'estrategico',
  'desarrollo',
]

export function RelationshipGraph({ person }: { person: Person }) {
  const mounted = useMounted()
  const people = useRelationshipStore((s) => s.people)
  const personLinks = useRelationshipStore((s) => s.personLinks)
  const router = useRouter()

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])

  const connections: Connection[] = useMemo(() => {
    const selfName = 'Yo' // el nodo central del grafo global es "Aaron"; acá es un contacto.
    const links = personLinks ?? []
    const out: Connection[] = []
    const seen = new Set<string>()
    for (const l of links) {
      const touchesSelfSide = l.personAId === SELF_ID || l.personBId === SELF_ID
      const isA = l.personAId === person.id
      const isB = l.personBId === person.id
      if (!isA && !isB) continue
      if (l.personAId === l.personBId) continue

      // El OTRO extremo del vínculo respecto de la ficha.
      const otherId = isA ? l.personBId : l.personAId
      const otherIsSelf = otherId === SELF_ID
      if (otherIsSelf && !touchesSelfSide) continue

      // La ficha es el DESTINO (personB) de una arista entre dos personas →
      // rol invertido. Si es una arista self→ficha, self es personA (no invertimos:
      // mostramos el rol tal cual, que para vínculos simétricos como "colega" da igual).
      const inverse = isB && !otherIsSelf

      const cat = categoryForLink(l.category, l.kind, otherIsSelf)
      const roleLabel = roleLabelFor(l.kind, inverse)

      let name: string
      let slug: string | undefined
      let initials: string
      let short: string
      if (otherIsSelf) {
        name = selfName
        initials = 'YO'
        short = selfName
      } else {
        const other = peopleById.get(otherId)
        name = other?.name ?? '(persona eliminada)'
        slug = other?.slug
        initials = initialsFromName(name)
        short = firstName(name) || initials
      }

      // Dedupe por el otro extremo (evita duplicar si hay dos aristas al mismo).
      const dedup = otherIsSelf ? 'self' : otherId
      if (seen.has(dedup)) continue
      seen.add(dedup)

      out.push({ key: l.id, slug, name, initials, short, isSelf: otherIsSelf, category: cat, roleLabel })
    }
    // Orden estable: self primero, luego por dominio, luego por nombre.
    return out.sort((a, b) => {
      const sa = SECTION_ORDER.indexOf(a.category)
      const sb = SECTION_ORDER.indexOf(b.category)
      if (sa !== sb) return sa - sb
      return a.name.localeCompare(b.name)
    })
  }, [personLinks, person.id, peopleById])

  // Agrupación "Estructura" por dominio.
  const sections = useMemo(() => {
    const byCat = new Map<GraphCategory, Connection[]>()
    for (const c of connections) {
      const arr = byCat.get(c.category) ?? []
      arr.push(c)
      byCat.set(c.category, arr)
    }
    return SECTION_ORDER.filter((cat) => byCat.has(cat)).map((cat) => ({
      category: cat,
      label: cat === 'self' ? 'Tú' : CATEGORY_LABEL[cat],
      items: byCat.get(cat)!,
    }))
  }, [connections])

  if (!mounted) return null

  const n = connections.length
  // Radio del anillo: crece un poco con la cantidad para no amontonar.
  const R = Math.max(130, Math.min(190, 96 + n * 12))
  const H = CY + R + 56 // deja aire abajo para las etiquetas del nodo inferior.

  // Posición radial de cada nodo (arranca arriba, -90°, sentido horario).
  const placed = connections.map((c, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, n) - Math.PI / 2
    return { ...c, x: CX + Math.cos(angle) * R, y: CY + Math.sin(angle) * R }
  })

  const go = (slug?: string) => {
    if (slug) router.push(`/relaciones/${slug}`)
  }

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-3">
          <Share2 size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
            Relaciones de {firstName(person.name) || person.name}
          </div>
        </div>

        {n === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin vínculos registrados todavía.{' '}
            <span className="text-muted-foreground/60">
              Agrega familia o vínculos profesionales/sociales abajo para trazar su red.
            </span>
          </p>
        ) : (
          <>
            {/* ── Ego-graph radial (SVG puro, layout a mano) ─────────────── */}
            <div className="w-full overflow-hidden rounded-lg border border-border bg-muted/10">
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full h-auto"
                role="img"
                aria-label={`Grafo de relaciones de ${person.name}`}
              >
                {/* Aristas centro→nodo (color del dominio del vínculo). */}
                {placed.map((c) => (
                  <line
                    key={`edge-${c.key}`}
                    x1={CX}
                    y1={CY}
                    x2={c.x}
                    y2={c.y}
                    style={{ stroke: token(c.category) }}
                    strokeWidth={1.5}
                    strokeOpacity={0.5}
                  />
                ))}

                {/* Etiqueta de rol sobre cada arista (a mitad de camino). */}
                {placed.map((c) => {
                  const mx = CX + (c.x - CX) * 0.52
                  const my = CY + (c.y - CY) * 0.52
                  return (
                    <text
                      key={`role-${c.key}`}
                      x={mx}
                      y={my}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      style={{ fill: 'hsl(var(--muted-foreground))' }}
                      fontSize={11}
                      className="select-none"
                    >
                      {c.roleLabel}
                    </text>
                  )
                })}

                {/* Nodos radiales (contactos). Click → deep-link al slug. */}
                {placed.map((c) => {
                  const clickable = !!c.slug
                  return (
                    <g
                      key={`node-${c.key}`}
                      transform={`translate(${c.x} ${c.y})`}
                      onClick={() => go(c.slug)}
                      style={{ cursor: clickable ? 'pointer' : 'default' }}
                      role={clickable ? 'link' : undefined}
                      aria-label={clickable ? `Ir a la ficha de ${c.name}` : c.name}
                    >
                      <circle
                        r={NODE_R + 5}
                        style={{ fill: token(c.category) }}
                        fillOpacity={0.14}
                      />
                      <circle
                        r={NODE_R}
                        style={{ fill: token(c.category), stroke: token(c.category) }}
                        fillOpacity={0.9}
                        strokeWidth={1.5}
                      />
                      <text
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="rgba(255,255,255,0.96)"
                        fontSize={13}
                        fontWeight={700}
                        className="select-none"
                      >
                        {c.initials}
                      </text>
                      <text
                        y={NODE_R + 16}
                        textAnchor="middle"
                        style={{ fill: 'hsl(var(--foreground))' }}
                        fontSize={12}
                        fontWeight={600}
                        className="select-none"
                      >
                        {c.short}
                      </text>
                    </g>
                  )
                })}

                {/* Nodo CENTRAL: la persona de la ficha. Look NEUTRAL de "hub"
                    (foreground) para que se lea como el foco de la tarjeta y no
                    se confunda con ningún dominio de color de los contactos. */}
                <g transform={`translate(${CX} ${CY})`}>
                  <circle r={SELF_R + 6} style={{ fill: 'hsl(var(--foreground))' }} fillOpacity={0.12} />
                  <circle
                    r={SELF_R}
                    style={{ fill: 'hsl(var(--foreground))', stroke: 'hsl(var(--foreground))' }}
                    fillOpacity={0.92}
                    strokeWidth={2}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{ fill: 'hsl(var(--background))' }}
                    fontSize={16}
                    fontWeight={700}
                    className="select-none"
                  >
                    {initialsFromName(person.name)}
                  </text>
                </g>
              </svg>
            </div>

            {/* ── Estructura (lista agrupada por dominio) ────────────────── */}
            <div className="mt-4">
              <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-2">
                Estructura
              </div>
              <div className="space-y-3">
                {sections.map((sec) => (
                  <div key={sec.category}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span
                        className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: token(sec.category) }}
                        aria-hidden="true"
                      />
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                        {sec.label}
                      </span>
                    </div>
                    <ul className="space-y-1 pl-4">
                      {sec.items.map((c) => (
                        <li key={c.key} className="flex items-center justify-between gap-2 py-1 border-b border-border/40 last:border-0">
                          <div className="min-w-0 flex items-center gap-2">
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 w-28 flex-shrink-0">
                              {c.roleLabel}
                            </span>
                            {c.slug ? (
                              <Link href={`/relaciones/${c.slug}`} className="text-sm text-foreground hover:underline truncate">
                                {c.name}
                              </Link>
                            ) : (
                              <span className="text-sm text-foreground truncate">{c.name}</span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
