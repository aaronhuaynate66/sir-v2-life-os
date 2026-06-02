// SIR V2 — Manejo de errores de API en el cliente (consolidado).
//
// El mismo patrón estaba duplicado en /buscar, DailyBriefingCard,
// ResumenClient, LoPersonal: parsear el body { error, detail } de una
// respuesta !ok y normalizar el catch a una forma tipada. Lo unificamos acá
// para que todas las vistas reporten errores igual y sea testeable.
//
// La forma { error, detail } es exactamente la que devuelven los route
// handlers (ver `errorJson` en src/app/api/**). status 0 = fallo de red /
// excepción antes de tener respuesta HTTP.

export interface ApiError {
  /** HTTP status, o 0 si la request ni siquiera llegó (red caída, abort). */
  status: number
  /** Mensaje accionable (del campo `error` del body, o `HTTP <status>`). */
  message: string
  /** Detalle opcional (del campo `detail` del body). */
  detail?: string
}

/**
 * Construye un ApiError desde una Response !ok, parseando su body JSON
 * { error, detail } de forma tolerante (un body ausente o no-JSON no rompe).
 */
export async function parseErrorResponse(res: Response): Promise<ApiError> {
  let body: { error?: unknown; detail?: unknown } = {}
  try {
    body = (await res.json()) as { error?: unknown; detail?: unknown }
  } catch {
    /* sin body / no-JSON: usamos el status */
  }
  const message = typeof body.error === 'string' && body.error ? body.error : `HTTP ${res.status}`
  const detail = typeof body.detail === 'string' && body.detail ? body.detail : undefined
  return { status: res.status, message, detail }
}

/**
 * Statuses que significan "se agotó el tiempo" en el gateway/función. Para
 * nuestras rutas LLM equivale a que el modelo tardó demasiado.
 *   - 408 Request Timeout · 504 Gateway Timeout · 524 (timeout de Cloudflare/CDN)
 */
const TIMEOUT_STATUSES = new Set([408, 504, 524])

/**
 * Si el ApiError es un timeout de gateway, reescribe su mensaje a algo claro y
 * accionable ("tardó demasiado, reintentá"). El resto pasa sin cambios. Útil
 * para las rutas LLM (plan/SMART) donde un 504 viene como HTML sin nuestro JSON.
 */
export function withTimeoutHint(err: ApiError): ApiError {
  if (TIMEOUT_STATUSES.has(err.status)) {
    return {
      status: err.status,
      message: 'La generación tardó demasiado',
      detail: 'El modelo no respondió a tiempo. Reintentá en unos segundos.',
    }
  }
  return err
}

/**
 * Normaliza un valor capturado (catch) a ApiError. Si ya es un ApiError
 * (tiene status numérico) lo devuelve tal cual; si no (Error de red, string,
 * etc.) lo envuelve con status 0.
 */
export function toApiError(e: unknown): ApiError {
  if (
    e &&
    typeof e === 'object' &&
    'status' in e &&
    typeof (e as { status: unknown }).status === 'number'
  ) {
    const err = e as ApiError
    return { status: err.status, message: err.message, detail: err.detail }
  }
  return { status: 0, message: e instanceof Error ? e.message : String(e) }
}

/**
 * POST JSON con manejo de error unificado: lanza un ApiError ante !ok.
 * El happy path devuelve el JSON tipado. Pensado para reusar en clientes
 * nuevos; los existentes pueden adoptar parseErrorResponse/toApiError sin
 * cambiar su fetch.
 */
export async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw await parseErrorResponse(res)
  return (await res.json()) as T
}
