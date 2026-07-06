// SIR V2 — Regresión lineal simple (OLS). PURO, reutilizable.
//
// Base del motor de predicción (Capa 0 analítica de conversaciones + Capa 1/2).
// Sin dependencias, sin API. Devuelve pendiente, intercepto y R² (bondad de ajuste).

export interface LinReg {
  slope: number
  intercept: number
  /** Bondad de ajuste 0..1. */
  r2: number
  n: number
}

/** OLS de ys sobre xs. null si <2 puntos o xs sin varianza (pendiente indefinida). */
export function linreg(xs: number[], ys: number[]): LinReg | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 2) return null
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0
  for (let i = 0; i < n; i++) {
    const x = xs[i], y = ys[i]
    sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y
  }
  const denomX = n * sxx - sx * sx
  if (denomX === 0) return null // xs constante → pendiente indefinida
  const slope = (n * sxy - sx * sy) / denomX
  const intercept = (sy - slope * sx) / n
  const denomY = n * syy - sy * sy
  const r2 = denomY === 0 ? 1 : Math.pow(n * sxy - sx * sy, 2) / (denomX * denomY)
  return { slope, intercept, r2: Math.max(0, Math.min(1, r2)), n }
}

/** Predice y para un x dado un ajuste. */
export function predict(reg: LinReg, x: number): number {
  return reg.intercept + reg.slope * x
}

/** Mediana de una lista (copia y ordena). null si vacía. */
export function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
