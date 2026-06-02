'use client'
// SIR V2 — Wrapper de react-force-graph-2d con render custom (rediseño UX).
//
// Mejoras de legibilidad (Aaron, captura mobile):
//  - Nodos MÁS GRANDES y dimensionados por importanceScore (jerarquía).
//  - Nombres CORTOS (primer nombre) en una "pill" con fondo, sin desbordar.
//  - SIN labels de edge fijos (se pisaban con los nombres): la categoría se lee
//    por color + leyenda; el label del edge aparece SÓLO al hover/tap del nodo.
//  - Hover/tap: resalta el nodo + sus edges y atenúa el resto.
//  - Más separación (charge/linkDistance) + zoomToFit para usar el canvas.
//
// 100% client-side (depende de <canvas>); se carga via dynamic import con
// ssr:false desde GraphView.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { GraphData } from '@/lib/graph/types'
import { CATEGORY_COLOR } from '@/lib/graph/colors'
import { hoverToHtml, type NodeHover } from '@/lib/graph/hover'

interface GraphCanvasProps {
  data: GraphData
  /** Clic en un nodo → navegar. isSelf=true para el nodo central. */
  onNavigate?: (nodeId: string, isSelf: boolean) => void
}

function toForceGraphData(data: GraphData) {
  return {
    nodes: data.nodes,
    links: data.edges.map((e) => ({
      source: e.source,
      target: e.target,
      color: e.color,
      label: e.label,
    })),
  }
}

const SELF_RADIUS = 15
const LABEL_OFFSET = 5 // px entre el bottom del circulo y el top de la pill

/** Radio del nodo por importanceScore (1-10) → 8..14 px. self = 15. Los de
 *  2º grado (familiares de un contacto, sin tu interacción directa) van más
 *  chicos (5..6.5) para que se lea que NO son tu red directa. */
function radiusFor(node: { isSelf?: boolean; score?: number; secondDegree?: boolean }): number {
  if (node.isSelf) return SELF_RADIUS
  const s = Math.min(10, Math.max(1, node.score ?? 5))
  if (node.secondDegree) return 5 + ((s - 1) / 9) * 1.5
  return 8 + ((s - 1) / 9) * 6
}

function idOf(x: unknown): string | undefined {
  if (typeof x === 'string') return x
  if (x && typeof x === 'object' && 'id' in x) return (x as { id?: string }).id
  return undefined
}

function nodeColor(node: { isSelf?: boolean; category?: keyof typeof CATEGORY_COLOR }): string {
  if (node.isSelf) return CATEGORY_COLOR.self
  const cat = node.category && CATEGORY_COLOR[node.category] ? node.category : 'networking'
  return CATEGORY_COLOR[cat]
}

type NodeLike = {
  id?: string
  label?: string
  shortName?: string
  fullName?: string
  category?: keyof typeof CATEGORY_COLOR
  isSelf?: boolean
  score?: number
  secondDegree?: boolean
  hover?: NodeHover
  x?: number
  y?: number
}

type LinkLike = {
  source?: string | NodeLike
  target?: string | NodeLike
  label?: string
  color?: string
}

export function GraphCanvas({ data, onNavigate }: GraphCanvasProps) {
  const fgRef = useRef<unknown>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const fgData = useMemo(() => toForceGraphData(data), [data])
  const [hovered, setHovered] = useState<string | null>(null)
  // react-force-graph-2d no mide su contenedor: sin width/height explícitos
  // cae a window.innerWidth/Height y el canvas desborda la card en mobile.
  // Medimos el wrapper con ResizeObserver y le pasamos px reales.
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

  // Reencuadrar al cambiar el tamaño del canvas (rotación / resize).
  useEffect(() => {
    if (!size) return
    const fg = fgRef.current as { zoomToFit?: (ms: number, padding: number) => void } | null
    try { fg?.zoomToFit?.(400, 70) } catch { /* layout aún no listo */ }
  }, [size])

  // Adyacencia para resaltar el nodo + sus vecinos al hover/tap.
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

  type ForceGraphRef = {
    zoomToFit?: (ms: number, padding: number) => void
    d3Force?: (name: string) => { strength?: (v: number) => void; distance?: (v: number) => void } | undefined
    __sirForcesConfigured?: boolean
  }

  const handleEngineStop = useCallback(() => {
    const fg = fgRef.current as ForceGraphRef | null
    if (!fg) return
    try {
      fg.zoomToFit?.(500, 70)
    } catch {
      /* primer mount puede no estar listo */
    }
  }, [])

  const handleEngineTick = useCallback(() => {
    const fg = fgRef.current as ForceGraphRef | null
    if (!fg || fg.__sirForcesConfigured) return
    try {
      // Más separación entre nodos para aprovechar el canvas y no apretar.
      fg.d3Force?.('charge')?.strength?.(-520)
      fg.d3Force?.('link')?.distance?.(150)
      fg.__sirForcesConfigured = true
    } catch {
      /* reintenta en el próximo tick */
    }
  }, [])

  const renderNode = useCallback(
    (rawNode: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const node = rawNode as NodeLike
      const x = node.x ?? 0
      const y = node.y ?? 0
      const radius = radiusFor(node)
      const active = nodeActive(node.id)
      const fill = nodeColor(node)

      ctx.save()
      // Activo: 2º grado un poco atenuado (0.78) vs directo (1). Inactivo: 0.2.
      ctx.globalAlpha = active ? (node.secondDegree ? 0.78 : 1) : 0.2

      // Glow del nodo enfocado (hover/tap).
      if (hovered && node.id === hovered) {
        ctx.beginPath()
        ctx.arc(x, y, radius + 5, 0, 2 * Math.PI)
        ctx.fillStyle = fill
        ctx.globalAlpha = 0.18
        ctx.fill()
        ctx.globalAlpha = 1
      }

      // Ring del self.
      if (node.isSelf) {
        ctx.beginPath()
        ctx.arc(x, y, radius + 3, 0, 2 * Math.PI)
        ctx.fillStyle = 'rgba(245, 245, 245, 0.18)'
        ctx.fill()
      }

      // Círculo.
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, 2 * Math.PI)
      ctx.fillStyle = fill
      ctx.fill()
      ctx.strokeStyle = node.isSelf ? '#f5f5f5' : 'rgba(255,255,255,0.45)'
      ctx.lineWidth = node.isSelf ? 2 : 1.25
      ctx.stroke()

      // Iniciales dentro (texto oscuro sobre colores saturados claros).
      const initialsSize = Math.max(8, Math.min(13, radius * 0.85))
      ctx.font = `700 ${initialsSize}px ui-sans-serif, system-ui`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#0a0a0a'
      ctx.fillText(node.label ?? '?', x, y)

      // Nombre corto debajo, en pill con fondo (legibilidad sobre el canvas).
      const name = node.shortName || node.fullName
      if (name && globalScale > 0.4) {
        const nameSize = Math.max(9, Math.min(12, 11 / Math.max(0.7, globalScale) + 1))
        ctx.font = `600 ${nameSize}px ui-sans-serif, system-ui`
        const metrics = ctx.measureText(name)
        const padX = 5
        const padY = 2.5
        const w = metrics.width + padX * 2
        const h = nameSize + padY * 2
        const pillY = y + radius + LABEL_OFFSET + h / 2
        ctx.fillStyle = 'rgba(10, 10, 10, 0.78)'
        roundRect(ctx, x - w / 2, pillY - h / 2, w, h, 4)
        ctx.fill()
        ctx.fillStyle = node.id === hovered ? '#ffffff' : '#e5e7eb'
        ctx.fillText(name, x, pillY)
      }

      ctx.restore()
    },
    [hovered, nodeActive],
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

  // Label del edge: SÓLO cuando el edge toca al nodo enfocado (evita el
  // pisado con los nombres). Sin hover, no se dibujan labels de edge.
  const renderLinkLabel = useCallback(
    (rawLink: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const link = rawLink as LinkLike
      if (!link.label || !edgeTouchesHover(link)) return
      const source = typeof link.source === 'object' ? link.source : null
      const target = typeof link.target === 'object' ? link.target : null
      if (!source || !target) return
      const mx = ((source.x ?? 0) + (target.x ?? 0)) / 2
      const my = ((source.y ?? 0) + (target.y ?? 0)) / 2

      const fontSize = Math.max(8, 10 / Math.max(0.85, globalScale))
      ctx.font = `600 ${fontSize}px ui-sans-serif, system-ui`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const text = link.label
      const metrics = ctx.measureText(text)
      const padding = 4
      const w = metrics.width + padding * 2
      const h = fontSize + padding
      ctx.fillStyle = 'rgba(10, 10, 10, 0.9)'
      roundRect(ctx, mx - w / 2, my - h / 2, w, h, 4)
      ctx.fill()
      ctx.fillStyle = link.color ?? '#cbd5e1'
      ctx.fillText(text, mx, my)
    },
    [edgeTouchesHover],
  )

  const linkColor = useCallback(
    (rawLink: unknown) => {
      const link = rawLink as LinkLike
      const base = link.color ?? '#64748b'
      if (hovered == null) return base
      return edgeTouchesHover(link) ? base : 'rgba(100,116,139,0.12)'
    },
    [hovered, edgeTouchesHover],
  )

  const linkWidth = useCallback(
    (rawLink: unknown) => {
      const link = rawLink as LinkLike
      if (hovered == null) return 2
      return edgeTouchesHover(link) ? 3.25 : 1
    },
    [hovered, edgeTouchesHover],
  )

  return (
    <div ref={wrapRef} className="relative w-full h-[60vh] sm:h-[70vh] min-h-[420px] rounded-lg border border-border bg-muted/10 overflow-hidden">
      {size && (
      <ForceGraph2D
        ref={fgRef as React.MutableRefObject<undefined>}
        width={size.w}
        height={size.h}
        graphData={fgData}
        backgroundColor="transparent"
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkCurvature={0.18}
        linkDirectionalArrowLength={0}
        cooldownTicks={140}
        d3AlphaDecay={0.03}
        d3VelocityDecay={0.42}
        onEngineStop={handleEngineStop}
        onEngineTick={handleEngineTick}
        nodeLabel={(node: NodeLike) => hoverToHtml(node.fullName ?? '', node.hover)}
        nodeRelSize={SELF_RADIUS}
        nodeCanvasObjectMode={() => 'replace'}
        nodeCanvasObject={renderNode}
        nodePointerAreaPaint={paintNodePointerArea}
        onNodeHover={(node: NodeLike | null) => setHovered(node?.id ?? null)}
        onNodeClick={(node: NodeLike) => {
          if (node?.id) onNavigate?.(node.id, !!node.isSelf)
        }}
        linkCanvasObjectMode={() => 'after'}
        linkCanvasObject={renderLinkLabel}
      />
      )}
    </div>
  )
}

/** Rectángulo redondeado (path). El caller hace fill()/stroke(). */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}
