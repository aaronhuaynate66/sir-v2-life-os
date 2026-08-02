// SIR V2 — Entregables: documentos que Aaron manda o lleva a alguien. PURO.
//
// ═══ POR QUÉ EXISTE ═══════════════════════════════════════════════════════════
//
// Aaron, 2-ago-2026: *"así solo acá no me sirve"*. SIR le armaba entregables —un
// informe para FEDEPOL, una cotización— y quedaban en `docs/*.md` del repo, donde
// él no entra. El mapeo de las 40 páginas confirmó que **no había ningún lugar
// para un documento** en toda la app.
//
// ═══ QUÉ DISTINGUE A UN ENTREGABLE ════════════════════════════════════════════
//
// No es una MEMORIA (eso es lo que SIR recuerda de su vida) ni una NOTA de una
// persona (eso la describe a ella). Un entregable **va hacia afuera**: tiene
// destinatario y tiene estado. Por eso lo interesante no es solo guardarlo, sino
// que un documento **listo y sin enviar es un pendiente** — y eso el sistema lo
// puede reclamar solo.
//
// PURO: cero red, cero DB.

export type TipoDocumento = 'informe' | 'cotizacion' | 'carta' | 'propuesta' | 'nota' | 'otro'
export type EstadoDocumento = 'borrador' | 'listo' | 'enviado'

export interface Documento {
  id: string
  title: string
  kind: TipoDocumento
  status: EstadoDocumento
  body: string
  internalNote?: string | null
  personId?: string | null
  objectiveId?: string | null
  dealId?: string | null
  storageBucket?: string | null
  sourceFilePath?: string | null
  sentAt?: string | null
  createdAt: string
  updatedAt: string
}

export const TIPOS: readonly TipoDocumento[] = ['informe', 'cotizacion', 'carta', 'propuesta', 'nota', 'otro']
export const ESTADOS: readonly EstadoDocumento[] = ['borrador', 'listo', 'enviado']

/** Etiqueta en castellano para la UI. */
export const ETIQUETA_TIPO: Readonly<Record<TipoDocumento, string>> = {
  informe: 'Informe',
  cotizacion: 'Cotización',
  carta: 'Carta',
  propuesta: 'Propuesta',
  nota: 'Nota',
  otro: 'Documento',
}

export const ETIQUETA_ESTADO: Readonly<Record<EstadoDocumento, string>> = {
  borrador: 'Borrador',
  listo: 'Listo para enviar',
  enviado: 'Enviado',
}

/** snake_case (DB) → camelCase. Tolerante: una columna ausente no rompe. PURA. */
export function filaADocumento(row: Record<string, unknown>): Documento {
  const kind = String(row.kind ?? 'nota')
  const status = String(row.status ?? 'borrador')
  return {
    id: String(row.id ?? ''),
    title: String(row.title ?? '(sin título)'),
    kind: (TIPOS as readonly string[]).includes(kind) ? kind as TipoDocumento : 'otro',
    status: (ESTADOS as readonly string[]).includes(status) ? status as EstadoDocumento : 'borrador',
    body: typeof row.body === 'string' ? row.body : '',
    internalNote: (row.internal_note as string | null) ?? null,
    personId: (row.person_id as string | null) ?? null,
    objectiveId: (row.objective_id as string | null) ?? null,
    dealId: (row.deal_id as string | null) ?? null,
    storageBucket: (row.storage_bucket as string | null) ?? null,
    sourceFilePath: (row.source_file_path as string | null) ?? null,
    sentAt: (row.sent_at as string | null) ?? null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? row.created_at ?? ''),
  }
}

/** Días desde que quedó LISTO sin enviarse. null si no aplica. PURA. */
export function diasSinEnviar(d: Documento, hoy: string): number | null {
  if (d.status !== 'listo') return null
  const a = Date.parse(String(d.updatedAt).slice(0, 10) + 'T00:00:00Z')
  const b = Date.parse(`${hoy}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

/** Cuántos días de espera hacen que valga la pena reclamarlo. */
export const DIAS_PARA_RECLAMAR = 2

/**
 * El entregable LISTO que lleva más tiempo sin enviarse. PURO. null si no hay.
 *
 * Es lo que convierte esta tabla en algo vivo y no en un cajón: un documento que
 * quedó listo y no salió es trabajo hecho que todavía no sirvió de nada — el caso
 * exacto de la cotización de Hikvision, redactada y frenada semanas por un dato
 * que faltaba.
 */
export function entregablePendiente(docs: readonly Documento[], hoy: string): { doc: Documento; dias: number } | null {
  let mejor: { doc: Documento; dias: number } | null = null
  for (const d of docs ?? []) {
    const dias = diasSinEnviar(d, hoy)
    if (dias === null || dias < DIAS_PARA_RECLAMAR) continue
    if (!mejor || dias > mejor.dias) mejor = { doc: d, dias }
  }
  return mejor
}

/** La línea del brief. null si no hay nada que reclamar. PURA. */
export function entregablePendienteLine(p: { doc: Documento; dias: number } | null | undefined): string | null {
  if (!p) return null
  const t = p.doc.title.length > 54 ? `${p.doc.title.slice(0, 53)}…` : p.doc.title
  return `📄 "${t}" está listo hace ${p.dias} días y no lo has mandado. ¿Lo envías hoy?`
}

/** Primeras líneas del cuerpo, para la tarjeta. PURA. */
export function resumenDeCuerpo(body: string, max = 160): string {
  const limpio = (body ?? '').replace(/\s+/g, ' ').trim()
  return limpio.length <= max ? limpio : `${limpio.slice(0, max - 1).trimEnd()}…`
}
