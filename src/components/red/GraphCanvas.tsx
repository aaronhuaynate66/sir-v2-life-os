'use client'
// SIR V2 — Wrapper de react-force-graph-2d con render custom de nodos.
//
// Renderea cada nodo como un circulo coloreado con label de iniciales y
// nombre completo debajo. Self node con border distintivo. Self queda
// fijado en (0,0) via fx/fy seteados en el builder.
//
// IMPORTANTE: este componente es 100% client-side — depende de <canvas>
// y se carga via dynamic import desde GraphView con ssr: false.

import { useMemo, useRef, useEffect } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import type { GraphData } from '@/lib/graph/types'
import { CATEGORY_COLOR } from '@/lib/graph/colors'

interface GraphCanvasProps {
  data: GraphData
}

/**
 * react-force-graph-2d espera nodes y links (no edges).
 * Tambien acepta solo `id` como string; nosotros ya tenemos esa shape.
 */
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

export function GraphCanvas({ data }: GraphCanvasProps) {
  const fgRef = useRef<unknown>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const fgData = useMemo(() => toForceGraphData(data), [data])

  // Auto-zoom-to-fit cuando cambia data (despues que termina el force layout).
  useEffect(() => {
    // react-force-graph expone zoomToFit() en la ref. Usamos setTimeout para
    // dejar que el force layout estabilice los nodos primero.
    const t = setTimeout(() => {
      const fg = fgRef.current as { zoomToFit?: (ms: number, padding: number) => void } | null
      try {
        fg?.zoomToFit?.(400, 60)
      } catch {
        // ignore — primer mount puede no tener zoomToFit listo
      }
    }, 600)
    return () => clearTimeout(t)
  }, [fgData])

  return (
    <div
      ref={wrapperRef}
      className="relative w-full h-[60vh] sm:h-[70vh] min-h-[400px] rounded-lg border border-border bg-muted/10 overflow-hidden"
    >
      <ForceGraph2D
        ref={fgRef as React.MutableRefObject<undefined>}
        graphData={fgData}
        backgroundColor="transparent"
        // Edges
        linkColor={(link: { color?: string }) => link.color ?? '#64748b'}
        linkWidth={1.5}
        linkCurvature={0.25}
        linkDirectionalArrowLength={0}
        // Force layout
        cooldownTicks={80}
        d3AlphaDecay={0.04}
        d3VelocityDecay={0.35}
        // Hover
        nodeLabel={(node: { fullName?: string }) => node.fullName ?? ''}
        // Custom node render
        nodeRelSize={8}
        nodeCanvasObjectMode={() => 'replace'}
        nodeCanvasObject={renderNode}
        // Edge label
        linkCanvasObjectMode={() => 'after'}
        linkCanvasObject={renderLinkLabel}
      />
    </div>
  )
}

type NodeLike = {
  id?: string
  label?: string
  fullName?: string
  category?: keyof typeof CATEGORY_COLOR
  isSelf?: boolean
  x?: number
  y?: number
}

type LinkLike = {
  source?: string | NodeLike
  target?: string | NodeLike
  label?: string
  color?: string
}

/** Render del nodo: circulo + iniciales adentro + fullName debajo. */
function renderNode(
  rawNode: unknown,
  ctx: CanvasRenderingContext2D,
  globalScale: number,
) {
  const node = rawNode as NodeLike
  const x = node.x ?? 0
  const y = node.y ?? 0
  const fill = CATEGORY_COLOR[node.category ?? 'networking']
  const radius = node.isSelf ? 16 : 12

  // Sombra suave para self
  if (node.isSelf) {
    ctx.beginPath()
    ctx.arc(x, y, radius + 3, 0, 2 * Math.PI)
    ctx.fillStyle = 'rgba(245, 245, 245, 0.15)'
    ctx.fill()
  }

  // Circulo del nodo
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, 2 * Math.PI)
  ctx.fillStyle = fill
  ctx.fill()
  // Border
  ctx.strokeStyle = node.isSelf ? '#f5f5f5' : 'rgba(255,255,255,0.25)'
  ctx.lineWidth = node.isSelf ? 2 : 1
  ctx.stroke()

  // Iniciales centradas
  const labelFontSize = Math.max(9, 12 / Math.max(0.6, globalScale))
  ctx.font = `600 ${labelFontSize}px ui-sans-serif, system-ui`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = node.isSelf ? '#0a0a0a' : '#0a0a0a'
  ctx.fillText(node.label ?? '?', x, y)

  // Nombre completo debajo (solo si zoom suficiente)
  if (globalScale > 0.55 && node.fullName) {
    const nameFontSize = Math.max(8, 11 / Math.max(0.6, globalScale))
    ctx.font = `400 ${nameFontSize}px ui-sans-serif, system-ui`
    ctx.fillStyle = '#cbd5e1'
    ctx.fillText(node.fullName, x, y + radius + nameFontSize + 2)
  }
}

/** Render del label del edge: pequeño texto a la mitad del segmento. */
function renderLinkLabel(
  rawLink: unknown,
  ctx: CanvasRenderingContext2D,
  globalScale: number,
) {
  const link = rawLink as LinkLike
  if (!link.label) return
  if (globalScale < 0.85) return // ocultar labels cuando hay mucho zoom-out

  // Despues del simulate inicial, source/target son objetos con x/y. Antes,
  // pueden ser strings (ids). Resolver de forma defensiva.
  const source = typeof link.source === 'object' ? link.source : null
  const target = typeof link.target === 'object' ? link.target : null
  if (!source || !target) return
  const sx = source.x ?? 0
  const sy = source.y ?? 0
  const tx = target.x ?? 0
  const ty = target.y ?? 0
  const mx = (sx + tx) / 2
  const my = (sy + ty) / 2

  const fontSize = Math.max(7, 9 / Math.max(0.85, globalScale))
  ctx.font = `500 ${fontSize}px ui-sans-serif, system-ui`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // Fondo del label para legibilidad sobre la curva
  const text = link.label
  const padding = 3
  const metrics = ctx.measureText(text)
  const w = metrics.width + padding * 2
  const h = fontSize + padding
  ctx.fillStyle = 'rgba(10, 10, 10, 0.85)'
  ctx.fillRect(mx - w / 2, my - h / 2, w, h)

  ctx.fillStyle = link.color ?? '#cbd5e1'
  ctx.fillText(text, mx, my)
}
