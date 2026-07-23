// react-force-graph-2d usa d3-force-3d internamente; importamos forceCollide de
// ahí para que el radio del anti-solape coincida con la simulación real. El
// paquete no publica tipos → declaración mínima de lo que usamos.
declare module 'd3-force-3d' {
  interface CollideForce<T> {
    strength(s: number): CollideForce<T>
    radius(r: number | ((node: T) => number)): CollideForce<T>
  }
  export function forceCollide<T = unknown>(
    radius?: number | ((node: T) => number),
  ): CollideForce<T>
  interface PositionForce<T> {
    strength(s: number | ((node: T) => number)): PositionForce<T>
    x(x: number | ((node: T) => number)): PositionForce<T>
    y(y: number | ((node: T) => number)): PositionForce<T>
  }
  export function forceX<T = unknown>(x?: number | ((node: T) => number)): PositionForce<T>
  export function forceY<T = unknown>(y?: number | ((node: T) => number)): PositionForce<T>
}
