'use client'
// SIR V2 — Grafo de relaciones estilo Obsidian / red neuronal.
//
// Look "que piensa y hace conexiones", sobre react-force-graph-2d:
//  - Nodos con GLOW radial que RESPIRA (sin shadowBlur) y tamaño por CONEXIONES
//    (grado) + importancia → los hubs destacan, como en Obsidian.
//  - Links = telaraña tenue en reposo; al hover se enciende el subgrafo (nodo +
//    vecinos) y se atenúa el resto.
//  - Partículas-sinapsis que viajan por las aristas del 1er grado y del hover
//    (el cue de "está conectando").
//  - Físicas con anti-solape (collide) para clusters legibles.
//  - 100% theme-aware: colores vía tokens hsl(var(--...)), re-leídos al togglear
//    el tema. Se carga client-side (dynamic ssr:false) desde GraphView.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { forceCollide, forceX, forceY } from 'd3-force-3d'
import type { GraphData, GraphCategory } from '@/lib/graph/types'
import { CATEGORY_TOKEN } from '@/lib/graph/colors'
import { hoverToHtml, type NodeHover } from '@/lib/graph/hover'

export type RiskLevel = 'overdue' | 'multiple' | 'due_soon' | 'low_tone'

interface GraphCanvasProps {
  data: GraphData
  /** Clic en un nodo → navegar. isSelf=true para el nodo central. */
  onNavigate?: (nodeId: string, isSelf: boolean) => void
  /** Nivel de riesgo por personId (viene de /api/panel/personas-en-riesgo).
   *  Cuando existe, se pinta un aro de color alrededor del nodo. */
  riskById?: Record<string, RiskLevel>
}

// '0 0% 93%' -> 'hsl(0 0% 93%)' ; con alfa -> 'hsl(0 0% 93% / .4)'
const hsl = (triplet: string, a = 1) => (a >= 1 ? `hsl(${triplet})` : `hsl(${triplet} / ${a})`)

type ThemeColors = {
  bg: string
  fg: string
  fgTriplet: string
  muted: string
  bad: string
  warn: string
  cat: Record<GraphCategory, string>
  catTriplet: Record<GraphCategory, string>
}

function readThemeColors(): ThemeColors {
  const cs = getComputedStyle(document.documentElement)
  const t = (name: string) => cs.getPropertyValue(name).trim() || '0 0% 50%'
  const cat = {} as Record<GraphCategory, string>
  const catTriplet = {} as Record<GraphCategory, string>
  for (const [k, tok] of Object.entries(CATEGORY_TOKEN)) {
    const tri = t(tok)
    catTriplet[k as GraphCategory] = tri
    cat[k as GraphCategory] = hsl(tri)
  }
  return {
    bg: hsl(t('--background')),
    fg: hsl(t('--foreground')),
    fgTriplet: t('--foreground'),
    muted: t('--muted-foreground'),
    bad: hsl(t('--destructive')),
    warn: hsl(t('--warning')),
    cat,
    catTriplet,
  }
}

const FONT = 'ui-sans-serif, system-ui'

// "Anillo de barrios": cada dominio tiene su ángulo → el layout empuja a sus
// miembros a esa zona (familia arriba, trabajo a un lado, etc.) para que emerjan
// clusters legibles en vez de un revoltijo. Ver forceX/forceY.
const DOMAIN_ANGLE: Record<string, number> = {
  familia: -Math.PI / 2,
  personal: -Math.PI / 6,
  profesional: Math.PI / 6,
  networking: Math.PI / 2,
  estrategico: (5 * Math.PI) / 6,
  desarrollo: (7 * Math.PI) / 6,
  organizacion: (3 * Math.PI) / 2,
  episodio: (11 * Math.PI) / 6,
}
const ZONE_R = 280
function zoneTarget(n: { isSelf?: boolean; category?: GraphCategory }): { x: number; y: number } {
  if (n.isSelf) return { x: 0, y: 0 }
  const a = DOMAIN_ANGLE[n.category ?? 'networking'] ?? 0
  return { x: Math.cos(a) * ZONE_R, y: Math.sin(a) * ZONE_R }
}

/** id -> fase de respiración (0..2π), estable por nodo. */
function phaseOf(id: string): number {
  const sum = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  return ((sum % 100) / 100) * Math.PI * 2
}

function toForceGraphData(data: GraphData) {
  // Layout inicial determinístico: "yo" anclado al centro (fx/fy=0) y los
  // contactos sembrados en un círculo, AGRUPADOS por categoría → converge limpio.
  const others = data.nodes.filter((n) => !n.isSelf)
  const ordered = [...others].sort((a, b) =>
    String((a as { category?: string }).category ?? '').localeCompare(
      String((b as { category?: string }).category ?? ''),
    ),
  )
  const R = 170
  const pos = new Map<string, { x: number; y: number }>()
  ordered.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(1, ordered.length) - Math.PI / 2
    pos.set((n as { id: string }).id, { x: Math.cos(angle) * R, y: Math.sin(angle) * R })
  })

  // Grado (nº de conexiones) por nodo → alimenta el radio y el collide.
  const degree = new Map<string, number>()
  for (const e of data.edges) {
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
    degree.set(e.target, (degree.get(e.target) ?? 0) + 1)
  }

  return {
    nodes: data.nodes.map((n) => {
      const id = (n as { id: string }).id
      const extra = { degree: degree.get(id) ?? 0, phase: phaseOf(id) }
      return n.isSelf
        ? { ...n, ...extra, fx: 0, fy: 0 }
        : { ...n, ...extra, ...(pos.get(id) ?? {}) }
    }),
    links: data.edges.map((e) => ({
      source: e.source,
      target: e.target,
      color: e.color,
      label: e.label,
      category: e.category,
    })),
  }
}

const SELF_RADIUS = 15
const LABEL_OFFSET = 5

/** Radio por importancia (score 1-10) + grado (√ para que un hub no explote). */
function radiusFor(node: { isSelf?: boolean; score?: number; secondDegree?: boolean; degree?: number }): number {
  if (node.isSelf) return SELF_RADIUS
  const s = Math.min(10, Math.max(1, node.score ?? 5))
  const deg = node.degree ?? 0
  if (node.secondDegree) return 5 + ((s - 1) / 9) * 1.5
  return 8 + ((s - 1) / 9) * 6 + Math.sqrt(deg) * 0.9
}

function idOf(x: unknown): string | undefined {
  if (typeof x === 'string') return x
  if (x && typeof x === 'object' && 'id' in x) return (x as { id?: string }).id
  return undefined
}

type NodeLike = {
  id?: string
  label?: string
  shortName?: string
  fullName?: string
  category?: GraphCategory
  isSelf?: boolean
  score?: number
  secondDegree?: boolean
  degree?: number
  phase?: number
  hover?: NodeHover
  x?: number
  y?: number
}

type LinkLike = {
  source?: string | NodeLike
  target?: string | NodeLike
  label?: string
  color?: string
  category?: GraphCategory
}

export function GraphCanvas({ data, onNavigate, riskById = {} }: GraphCanvasProps) {
  const fgRef = useRef<unknown>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const fgData = useMemo(() => toForceGraphData(data), [data])
  const [hovered, setHovered] = useState<string | null>(null)

  // Colores del tema, re-leídos al togglear .dark (el canvas no lee CSS solo).
  const [theme, setTheme] = useState<ThemeColors | null>(null)
  useEffect(() => {
    const apply = () => setTheme(readThemeColors())
    apply()
    const mo = new MutationObserver(apply)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [])

  // Medir el wrapper (react-force-graph no mide su contenedor).
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Reencuadrar al cambiar el tamaño (rotación / resize).
  useEffect(() => {
    if (!size) return
    const fg = fgRef.current as { zoomToFit?: (ms: number, padding: number) => void } | null
    try { fg?.zoomToFit?.(400, 70) } catch { /* layout aún no listo */ }
  }, [size])

  // Fuerzas d3: separación + anti-solape (collide con el radio real que dibujamos).
  useEffect(() => {
    const fg = fgRef.current as {
      d3Force?: (name: string, f?: unknown) => { strength?: (v: number) => unknown; distance?: (v: number) => unknown; distanceMax?: (v: number) => unknown } | undefined
      d3ReheatSimulation?: () => void
    } | null
    if (!fg?.d3Force) return
    try {
      fg.d3Force('charge')?.strength?.(-320)
      fg.d3Force('charge')?.distanceMax?.(500)
      fg.d3Force('link')?.distance?.(90)
      fg.d3Force('link')?.strength?.(0.6)
      // Center casi apagado: las fuerzas por dominio (abajo) ubican los barrios;
      // un center fuerte los volvería a amontonar en el medio.
      fg.d3Force('center')?.strength?.(0.01)
      fg.d3Force('collide', forceCollide((n: NodeLike) => radiusFor(n) + 5).strength(0.9))
      // "BARRIOS": empujar cada persona hacia la zona de su dominio (familia a un
      // lado, trabajo a otro, bomberos a otro) → emergen clusters legibles en vez
      // del revoltijo. El self queda anclado al centro (fx/fy=0, sin empuje).
      const strength = (n: NodeLike) => (n.isSelf ? 0 : 0.13)
      fg.d3Force('x', forceX<NodeLike>((n) => zoneTarget(n).x).strength(strength))
      fg.d3Force('y', forceY<NodeLike>((n) => zoneTarget(n).y).strength(strength))
      fg.d3ReheatSimulation?.()
    } catch { /* aún no listo */ }
  }, [fgData])

  // Fit inicial animado, una sola vez.
  const handleEngineStop = useCallback(() => {
    // Encuadrar CADA vez que el layout converge (no una sola, que quedaba pegado
    // a medio dibujar mostrando ~30 de 79). Padding generoso para no cortar
    // nodos/etiquetas del borde.
    const fg = fgRef.current as { zoomToFit?: (ms: number, p: number) => void } | null
    try { fg?.zoomToFit?.(600, 80) } catch { /* layout aún no listo */ }
  }, [])

  // Adyacencia para resaltar nodo + vecinos al hover/tap.
  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const e of data.edges) {
      if (!m.has(e.source)) m.set(e.source, new Set())
      if (!m.has(e.target)) m.set(e.target, new Set())
      m.get(e.source)!.add(e.target)
      m.get(e.target)!.add(e.source)
    }
    return m
  }, [data.edges])

  const nodeActive = useCallback(
    (id: string | undefined): boolean => {
      if (hovered == null) return true
      if (id == null) return false
      return id === hovered || (neighbors.get(hovered)?.has(id) ?? false)
    },
    [hovered, neighbors],
  )

  const edgeTouchesHover = useCallback(
    (link: LinkLike): boolean => {
      if (hovered == null) return false
      return idOf(link.source) === hovered || idOf(link.target) === hovered
    },
    [hovered],
  )

  const renderNode = useCallback(
    (rawNode: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => {
      if (!theme) return
      const node = rawNode as NodeLike
      const x = node.x ?? 0
      const y = node.y ?? 0
      const radius = radiusFor(node)
      const isHover = hovered != null && node.id === hovered
      const active = nodeActive(node.id)
      const cat = (node.isSelf ? 'self' : node.category ?? 'networking') as GraphCategory
      const fill = theme.cat[cat]
      const triplet = theme.catTriplet[cat]
      const baseAlpha = active ? (node.secondDegree ? 0.85 : 1) : 0.18

      ctx.save()

      // Halo/glow radial que respira (sin shadowBlur → gradiente radial).
      const time = performance.now() / 1000
      const speed = node.isSelf ? 1.0 : 0.55
      const breath = 0.5 + 0.5 * Math.sin(time * speed + (node.phase ?? 0))
      const glowR = radius * (isHover ? 3.2 : active ? 2.3 : 1.9) + breath * (node.isSelf ? 5 : 2.5)
      const glowA = (isHover ? 0.5 : active ? 0.24 : 0.1) * (0.55 + 0.45 * breath)
      const grad = ctx.createRadialGradient(x, y, radius * 0.2, x, y, glowR)
      grad.addColorStop(0, hsl(triplet, glowA))
      grad.addColorStop(1, hsl(triplet, 0))
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(x, y, glowR, 0, 2 * Math.PI)
      ctx.fill()

      ctx.globalAlpha = baseAlpha

      // Aro de marca del self.
      if (node.isSelf) {
        ctx.beginPath()
        ctx.arc(x, y, radius + 3.5, 0, 2 * Math.PI)
        ctx.strokeStyle = hsl(triplet, 0.45)
        ctx.lineWidth = 2
        ctx.stroke()
      }

      // Aro de RIESGO (stroke, no disco → no se confunde con el color de dominio).
      const risk = !node.isSelf ? riskById[String(node.id)] : undefined
      if (risk) {
        const rc = risk === 'overdue' || risk === 'multiple' ? theme.bad : theme.warn
        ctx.beginPath()
        ctx.arc(x, y, radius + 2.5, 0, 2 * Math.PI)
        ctx.strokeStyle = rc
        ctx.lineWidth = 2.5
        ctx.stroke()
      }

      // Núcleo sólido + anillo fino de acento.
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, 2 * Math.PI)
      ctx.fillStyle = fill
      ctx.fill()
      ctx.lineWidth = (isHover ? 1.6 : 0.7) / Math.max(0.5, globalScale)
      ctx.strokeStyle = hsl(triplet, 0.9)
      ctx.stroke()

      // Iniciales: blanco (todos los hues son mid/dark → contrasta en ambos temas).
      if (radius >= 7) {
        const initialsSize = Math.max(8, Math.min(13, radius * 0.85))
        ctx.font = `700 ${initialsSize}px ${FONT}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = 'rgba(255,255,255,0.96)'
        ctx.fillText(node.label ?? '?', x, y)
      }

      // Nombre: LOD por zoom, o forzado si es el nodo/vecino en hover.
      const name = node.shortName || node.fullName
      const forced = hovered != null && active
      const show = name && (globalScale > 1.15 || forced)
      if (show) {
        const nameSize = Math.max(9, Math.min(12, 11 / Math.max(0.7, globalScale) + 1))
        ctx.font = `600 ${nameSize}px ${FONT}`
        const fade = forced ? 1 : Math.min(1, (globalScale - 1.15) / 0.5)
        ctx.globalAlpha = baseAlpha * fade
        const m = ctx.measureText(name!)
        const padX = 5
        const padY = 2.5
        const w = m.width + padX * 2
        const h = nameSize + padY * 2
        const pillY = y + radius + LABEL_OFFSET + h / 2
        ctx.fillStyle = hsl(theme.fgTriplet, 0.08)
        roundRect(ctx, x - w / 2, pillY - h / 2, w, h, 4)
        ctx.fill()
        ctx.fillStyle = isHover ? theme.fg : hsl(theme.fgTriplet, 0.75)
        ctx.fillText(name!, x, pillY)
      }

      ctx.restore()
    },
    [theme, hovered, nodeActive, riskById],
  )

  const paintNodePointerArea = useCallback(
    (rawNode: unknown, color: string, ctx: CanvasRenderingContext2D) => {
      const node = rawNode as NodeLike
      const x = node.x ?? 0
      const y = node.y ?? 0
      const radius = radiusFor(node)
      ctx.beginPath()
      ctx.arc(x, y, radius + 3, 0, 2 * Math.PI)
      ctx.fillStyle = color
      ctx.fill()
    },
    [],
  )

  // Label del edge: SÓLO cuando toca al nodo enfocado (sin hover no hay labels).
  // Fase 2: link pintado con GRADIENTE del color del dominio ORIGEN al DESTINO
  // → el vínculo ES la conexión entre dos áreas de la vida de Aaron (familia↔
  // trabajo, etc.). En reposo, telaraña tenue; al hover, se enciende el subgrafo
  // y se atenúa el resto. El label del edge sale solo al hover.
  const paintLink = useCallback(
    (rawLink: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => {
      if (!theme) return
      const link = rawLink as LinkLike
      const s = typeof link.source === 'object' ? link.source : null
      const t = typeof link.target === 'object' ? link.target : null
      if (!s || s.x == null || s.y == null || !t || t.x == null || t.y == null) return
      // Aristas EGO (yo→cada contacto): ruido puro — es obvio que conoces a toda
      // tu red. Eso era el "sol de rayos". NO se dibujan en reposo; solo aparecen
      // al hover del nodo (focus+context). Lo valioso es persona↔persona.
      if ((s.isSelf || t.isSelf) && !edgeTouchesHover(link)) return
      const touches = edgeTouchesHover(link)
      const dim = hovered != null && !touches
      const catOf = (n: NodeLike): GraphCategory => (n.isSelf ? 'self' : (n.category ?? 'networking'))
      const grad = ctx.createLinearGradient(s.x, s.y, t.x, t.y)
      grad.addColorStop(0, theme.cat[catOf(s)])
      grad.addColorStop(1, theme.cat[catOf(t)])

      ctx.save()
      ctx.globalAlpha = hovered == null ? 0.24 : touches ? 0.95 : 0.05
      ctx.strokeStyle = grad
      ctx.lineWidth = (touches ? 2.4 : dim ? 0.5 : 0.9) / Math.max(0.7, globalScale)
      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(t.x, t.y)
      ctx.stroke()
      ctx.globalAlpha = 1

      if (link.label && touches) {
        const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2
        const fontSize = Math.max(8, 10 / Math.max(0.85, globalScale))
        ctx.font = `600 ${fontSize}px ${FONT}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const w = ctx.measureText(link.label).width + 8
        const h = fontSize + 4
        ctx.fillStyle = hsl(theme.fgTriplet, 0.1)
        roundRect(ctx, mx - w / 2, my - h / 2, w, h, 4)
        ctx.fill()
        ctx.fillStyle = theme.fg
        ctx.fillText(link.label, mx, my)
      }
      ctx.restore()
    },
    [theme, hovered, edgeTouchesHover],
  )

  const particleCount = useCallback(
    (rawLink: unknown) => {
      const link = rawLink as LinkLike
      if (edgeTouchesHover(link)) return 3
      const s = idOf(link.source)
      const t = idOf(link.target)
      return s === 'self' || t === 'self' ? 1 : 0
    },
    [edgeTouchesHover],
  )

  const particleColor = useCallback(
    (rawLink: unknown) => {
      const link = rawLink as LinkLike
      if (!theme) return 'rgba(150,150,150,0.6)'
      if (hovered != null && !edgeTouchesHover(link)) return hsl(theme.muted, 0.08)
      const tgt = typeof link.target === 'object' ? (link.target as NodeLike) : null
      const cat = (tgt?.category ?? link.category ?? 'networking') as GraphCategory
      return theme.cat[cat]
    },
    [theme, hovered, edgeTouchesHover],
  )

  const particleWidth = useCallback(
    (rawLink: unknown) => (edgeTouchesHover(rawLink as LinkLike) ? 2.4 : 1.4),
    [edgeTouchesHover],
  )

  return (
    <div ref={wrapRef} className="relative w-full h-[60vh] sm:h-[70vh] min-h-[420px] rounded-lg border border-border overflow-hidden">
      {size && theme && (
        <ForceGraph2D
          ref={fgRef as React.MutableRefObject<undefined>}
          width={size.w}
          height={size.h}
          graphData={fgData}
          backgroundColor={theme.bg}
          autoPauseRedraw={false}
          linkCurvature={0}
          linkDirectionalArrowLength={0}
          linkDirectionalParticles={particleCount}
          linkDirectionalParticleSpeed={0.004}
          linkDirectionalParticleWidth={particleWidth}
          linkDirectionalParticleColor={particleColor}
          warmupTicks={60}
          cooldownTicks={350}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.32}
          onEngineStop={handleEngineStop}
          nodeLabel={(node: NodeLike) => hoverToHtml(node.fullName ?? '', node.hover)}
          nodeRelSize={SELF_RADIUS}
          nodeCanvasObjectMode={() => 'replace'}
          nodeCanvasObject={renderNode}
          nodePointerAreaPaint={paintNodePointerArea}
          onNodeHover={(node: NodeLike | null) => setHovered(node?.id ?? null)}
          onNodeClick={(node: NodeLike) => {
            if (node?.id) onNavigate?.(node.id, !!node.isSelf)
          }}
          linkCanvasObjectMode={() => 'replace'}
          linkCanvasObject={paintLink}
        />
      )}
      {/* Vignette sutil: remata el look en oscuro, casi invisible en claro. */}
      <div className="pointer-events-none absolute inset-0" style={{ boxShadow: 'inset 0 0 160px hsl(var(--background) / 0.7)' }} />
    </div>
  )
}

/** Rectángulo redondeado (path). El caller hace fill()/stroke(). */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}
