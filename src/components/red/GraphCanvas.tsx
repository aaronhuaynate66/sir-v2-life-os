'use client'
// SIR V2 — Wrapper de react-force-graph-2d con render custom de nodos.
//
// Renderea cada nodo como un circulo coloreado con label de iniciales y
// nombre completo debajo. Self node con border distintivo. Self queda
// fijado en (0,0) via fx/fy seteados en el builder.
//
// IMPORTANTE: este componente es 100% client-side — depende de <canvas>
// y se carga via dynamic import desde GraphView con ssr: false.

import { useCallback, useMemo, useRef } from 'react'
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

const NODE_RADIUS = 7
const SELF_NODE_RADIUS = 10
const LABEL_OFFSET = 4 // px entre el bottom del circulo y el top del nombre

export function GraphCanvas({ data }: GraphCanvasProps) {
  // react-force-graph ref expone una API compleja (zoomToFit, d3Force, etc.)
  // que no esta tipada en el package. Usamos unknown + cast en el uso.
  const fgRef = useRef<unknown>(null)
  const fgData = useMemo(() => toForceGraphData(data), [data])

  // Shape minima de la ref que necesitamos. La lib expone mas pero solo
  // usamos zoomToFit + d3Force.
  type ForceGraphRef = {
    zoomToFit?: (ms: number, padding: number) => void
    d3Force?: (name: string) => { strength?: (v: number) => void; distance?: (v: number) => void } | undefined
    __sirForcesConfigured?: boolean
  }

  // Configurar fuerzas d3 + zoom-to-fit cuando el engine inicializa.
  // El callback `onEngineStop` se dispara cuando la simulacion para.
  const handleEngineStop = useCallback(() => {
    const fg = fgRef.current as ForceGraphRef | null
    if (!fg) return
    try {
      // Padding 100 (no 40) para reservar espacio a los labels debajo de
      // cada nodo — con pocos nodos (ej. self + Diana), un padding chico
      // recortaba "Diana Carolina" a "Diana C" y "Aaron Huaynate Espinoza"
      // a "Aaron Huayna". 100 px funciona consistente para nombres largos.
      fg.zoomToFit?.(400, 100)
    } catch {
      // Primer mount puede no estar listo todavia.
    }
  }, [])

  // Ajustar fuerzas tras el primer mount.
  const handleEngineTick = useCallback(() => {
    const fg = fgRef.current as ForceGraphRef | null
    if (!fg || fg.__sirForcesConfigured) return
    try {
      const charge = fg.d3Force?.('charge')
      charge?.strength?.(-280)
      const link = fg.d3Force?.('link')
      link?.distance?.(110)
      fg.__sirForcesConfigured = true
    } catch {
      // Si la API d3Force no esta lista, sera reintentado en proximo tick.
    }
  }, [])

  return (
    <div className="relative w-full h-[60vh] sm:h-[70vh] min-h-[400px] rounded-lg border border-border bg-muted/10 overflow-hidden">
      <ForceGraph2D
        ref={fgRef as React.MutableRefObject<undefined>}
        graphData={fgData}
        backgroundColor="transparent"
        // ─── Edges ────────────────────────────────────────────────
        linkColor={(link: { color?: string }) => link.color ?? '#64748b'}
        linkWidth={1.8}
        linkCurvature={0.3}
        linkDirectionalArrowLength={0}
        // ─── Force layout ─────────────────────────────────────────
        cooldownTicks={120}
        d3AlphaDecay={0.035}
        d3VelocityDecay={0.4}
        onEngineStop={handleEngineStop}
        onEngineTick={handleEngineTick}
        // ─── Hover ───────────────────────────────────────────────
        nodeLabel={(node: { fullName?: string }) => node.fullName ?? ''}
        // ─── Custom node render ──────────────────────────────────
        nodeRelSize={NODE_RADIUS}
        nodeCanvasObjectMode={() => 'replace'}
        nodeCanvasObject={renderNode}
        // Pointer area (clickable region) — usa el circulo, no el label.
        nodePointerAreaPaint={paintNodePointerArea}
        // ─── Edge label ──────────────────────────────────────────
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

/**
 * Resuelve el color del nodo defensivamente.
 * `isSelf` SIEMPRE gana sobre `category` para evitar que el self herede
 * un color de categoria (ej. cuando un round-trip por la lib pierde
 * el category prop).
 */
function nodeColor(node: NodeLike): string {
  if (node.isSelf) return CATEGORY_COLOR.self
  const cat = node.category && CATEGORY_COLOR[node.category] ? node.category : 'networking'
  return CATEGORY_COLOR[cat]
}

/** Render del nodo: circulo + iniciales DENTRO + fullName DEBAJO. */
function renderNode(
  rawNode: unknown,
  ctx: CanvasRenderingContext2D,
  globalScale: number,
) {
  const node = rawNode as NodeLike
  const x = node.x ?? 0
  const y = node.y ?? 0
  const fill = nodeColor(node)
  const radius = node.isSelf ? SELF_NODE_RADIUS : NODE_RADIUS

  // Sombra suave para self (ring exterior).
  if (node.isSelf) {
    ctx.beginPath()
    ctx.arc(x, y, radius + 3, 0, 2 * Math.PI)
    ctx.fillStyle = 'rgba(245, 245, 245, 0.18)'
    ctx.fill()
  }

  // Circulo del nodo.
  ctx.beginPath()
  ctx.arc(x, y, radius, 0, 2 * Math.PI)
  ctx.fillStyle = fill
  ctx.fill()
  // Border.
  ctx.strokeStyle = node.isSelf ? '#f5f5f5' : 'rgba(255,255,255,0.4)'
  ctx.lineWidth = node.isSelf ? 1.8 : 1
  ctx.stroke()

  // Iniciales centradas DENTRO del circulo.
  // Texto oscuro sobre cualquier color (todos los colores son saturados claros).
  const labelFontSize = Math.max(7, Math.min(10, radius * 0.95))
  ctx.font = `700 ${labelFontSize}px ui-sans-serif, system-ui`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#0a0a0a'
  ctx.fillText(node.label ?? '?', x, y)

  // Nombre completo DEBAJO del circulo (solo si zoom suficiente para legibilidad).
  if (globalScale > 0.55 && node.fullName) {
    const nameFontSize = Math.max(8, Math.min(11, 10 / Math.max(0.6, globalScale) + 1))
    ctx.font = `500 ${nameFontSize}px ui-sans-serif, system-ui`
    const text = node.fullName
    const metrics = ctx.measureText(text)
    const padX = 4
    const padY = 2
    const w = metrics.width + padX * 2
    const h = nameFontSize + padY * 2
    const labelY = y + radius + LABEL_OFFSET + h / 2
    // Fondo del label para legibilidad cuando los nodos quedan cerca.
    ctx.fillStyle = 'rgba(10, 10, 10, 0.72)'
    ctx.fillRect(x - w / 2, labelY - h / 2, w, h)
    ctx.fillStyle = '#e5e7eb'
    ctx.fillText(text, x, labelY)
  }
}

/** Hit area del nodo para hover/click. */
function paintNodePointerArea(
  rawNode: unknown,
  color: string,
  ctx: CanvasRenderingContext2D,
) {
  const node = rawNode as NodeLike
  const x = node.x ?? 0
  const y = node.y ?? 0
  const radius = node.isSelf ? SELF_NODE_RADIUS : NODE_RADIUS
  ctx.beginPath()
  ctx.arc(x, y, radius + 2, 0, 2 * Math.PI)
  ctx.fillStyle = color
  ctx.fill()
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

  // Fondo del label para legibilidad sobre la curva.
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
