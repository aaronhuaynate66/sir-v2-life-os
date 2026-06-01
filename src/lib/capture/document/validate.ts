// SIR V2 — Validación + sanitización del JSON de extracción de documentos.
// Lógica pura, testeada. Acepta el shape crudo del modelo (snake_case) y
// devuelve un DocumentExtracted limpio (camelCase), o detecta shape inválido.

import type { DocumentExtracted } from './types'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function strOrNull(v: unknown, max = 60): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

/** ¿El JSON crudo tiene la forma esperada? (las 4 keys presentes, string|null) */
export function isValidDocumentRaw(x: unknown): boolean {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  const keys = ['documento_tipo', 'documento_numero', 'pasaporte_numero', 'pasaporte_vencimiento']
  return keys.every((k) => k in o && (o[k] === null || typeof o[k] === 'string'))
}

/**
 * Sanitiza el JSON crudo del modelo → DocumentExtracted. Normaliza vacíos a
 * null, capea longitudes y descarta fechas que no sean YYYY-MM-DD válidas
 * (mes 01-12, día 01-31; el modelo ya debería normalizar, esto es defensa).
 */
export function sanitizeDocumentExtracted(raw: unknown): DocumentExtracted {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const venc = strOrNull(o.pasaporte_vencimiento, 10)
  let pasaporteVencimiento: string | null = null
  if (venc && DATE_RE.test(venc)) {
    const month = Number(venc.slice(5, 7))
    const day = Number(venc.slice(8, 10))
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) pasaporteVencimiento = venc
  }
  return {
    documentoTipo: strOrNull(o.documento_tipo, 40),
    documentoNumero: strOrNull(o.documento_numero, 40),
    pasaporteNumero: strOrNull(o.pasaporte_numero, 40),
    pasaporteVencimiento,
  }
}
