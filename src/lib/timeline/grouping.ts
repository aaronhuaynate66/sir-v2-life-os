// SIR V2 — Agrupación de TimelineEvents por capture_id.
//
// Toma un array de events (single, pre-grouping) y devuelve un array mixto:
//   - Events sin captureId pasan tal cual.
//   - Events con mismo captureId se fusionan en UN GroupedTimelineEvent.
//   - Events con captureId pero sin pareja (grupo de 1) pasan tal cual.
//
// El render diferencia via `isGrouped(event)`. Llamado SOLO cuando search
// está vacía (cuando hay search activa, mostramos rows flat).
//
// Por G3 del diseño: la decisión de si llamar grouping vive en query.ts
// fetchPage; este módulo es agnóstico de filters.

import type { TimelineEvent, GroupedItem, TimelineEventType } from './types'

/**
 * Agrupa events por captureId. Mantiene orden global por occurredAt DESC.
 */
export function groupByCapture(events: TimelineEvent[]): TimelineEvent[] {
  // 1. Particionar: con vs sin captureId
  const byCapture = new Map<string, TimelineEvent[]>()
  const standalone: TimelineEvent[] = []

  for (const e of events) {
    if (e.captureId) {
      const list = byCapture.get(e.captureId) ?? []
      list.push(e)
      byCapture.set(e.captureId, list)
    } else {
      standalone.push(e)
    }
  }

  // 2. Para cada grupo: solo fusionar si tiene 2+ items
  const merged: TimelineEvent[] = [...standalone]
  for (const [captureId, items] of byCapture) {
    if (items.length === 1) {
      // Captura "huérfana" en la página — render como single para no
      // mostrar un grupo de 1 item (que sería visualmente confuso).
      merged.push(items[0])
      continue
    }
    merged.push(buildGroupedEvent(captureId, items))
  }

  // 3. Re-sort DESC por occurredAt (la particion altero el orden)
  return sortDesc(merged)
}

function sortDesc(events: TimelineEvent[]): TimelineEvent[] {
  return events.sort((a, b) => {
    if (a.occurredAt > b.occurredAt) return -1
    if (a.occurredAt < b.occurredAt) return 1
    if (a.id < b.id) return 1
    if (a.id > b.id) return -1
    return 0
  })
}

/**
 * Construye un GroupedTimelineEvent a partir de N items con mismo captureId.
 * Items vienen ordenados por sortDesc del caller, así el primero es el
 * más reciente — su tipo + occurredAt definen el header.
 *
 * Title: siempre "Captura". El body line se deriva de captureKind +
 * confidence para evitar hardcodear "Captura báscula" cuando aparezcan
 * otros tipos (WhatsApp, futuros).
 */
function buildGroupedEvent(captureId: string, items: TimelineEvent[]): TimelineEvent {
  // Ordenar items dentro del grupo por occurredAt DESC para que el
  // "newest" sea el primero — relevante si los timestamps difieren.
  const orderedItems = sortDesc([...items])
  const newest = orderedItems[0]

  const groupedItems: GroupedItem[] = orderedItems.map((it) => ({
    id: it.id,
    type: it.type,
    label: extractLabel(it),
    display: extractDisplay(it),
  }))

  // captureKind: tomar el primero no-undefined (asumimos uniformidad
  // dentro de una captura, que es el caso para scale).
  const captureKind = orderedItems
    .map((it) => it.captureKind)
    .find((k): k is 'scale' | 'whatsapp' => k !== undefined)

  // confidence: idem, desde meta.
  const confidence = orderedItems
    .map((it) => it.meta?.confidence as string | undefined)
    .find((c): c is string => typeof c === 'string')

  const body = buildBodyLine(captureKind, confidence)

  return {
    id: `capture:${captureId}`,
    // Tipo predominante para icon + chip color del header. El primero
    // (newest) define. Para captures cross-type futuras se podría
    // calcular el "most common", pero por simplicidad usamos el newest.
    type: newest.type,
    occurredAt: newest.occurredAt,
    title: 'Captura',
    body,
    tags: [`${groupedItems.length} métricas`],
    meta: {
      itemCount: groupedItems.length,
      captureKind,
      confidence,
    },
    captureId,
    captureKind,
    groupedItems,
  }
}

const CAPTURE_KIND_LABEL: Record<'scale' | 'whatsapp', string> = {
  scale: 'Báscula',
  whatsapp: 'WhatsApp',
}

function buildBodyLine(
  kind: 'scale' | 'whatsapp' | undefined,
  confidence: string | undefined,
): string {
  const kindLabel = kind ? CAPTURE_KIND_LABEL[kind] : 'Manual'
  if (confidence) return `${kindLabel} · conf. ${confidence}`
  return kindLabel
}

/**
 * Extrae el label de un title como "Peso: 82.2 kg" -> "Peso".
 * Convencion robusta porque todos los adapters single emiten
 * `${label}: ${value}` (ver adapters/*.ts).
 */
function extractLabel(event: TimelineEvent): string {
  const colonIdx = event.title.indexOf(':')
  if (colonIdx > 0) return event.title.slice(0, colonIdx).trim()
  // Fallback: usar el primer tag (los adapters meten el label como primer tag).
  if (event.tags.length > 0) return event.tags[0]
  return event.title
}

/**
 * Extrae el value formateado de "Peso: 82.2 kg" -> "82.2 kg".
 * Fallback: el title completo.
 */
function extractDisplay(event: TimelineEvent): string {
  const colonIdx = event.title.indexOf(':')
  if (colonIdx > 0) return event.title.slice(colonIdx + 1).trim()
  return event.title
}

// Re-export tipos por conveniencia para tests/UI
export type { TimelineEvent, GroupedItem, TimelineEventType }
