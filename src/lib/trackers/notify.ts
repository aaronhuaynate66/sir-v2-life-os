// SIR V2 — Alertas de trackers (PURO): qué avisar, cuándo, y el payload de email.
//
// Dos consumidores:
//   - in-app  : buildTrackerAlerts() arma las alertas vivas para Señales/tablero.
//   - email   : shouldSendEmail() decide idempotencia (no spamear) y
//               buildEmailPayload() arma el correo con deep-link al tablero.
//
// Todo determinístico (now inyectado). El cron usa shouldSendEmail + buildEmailPayload.

import type { Tracker } from '@/types'
import { conditionLabel, evaluateCondition, isStale, trackerStatus } from './evaluate'

/** Sólo 'met' y 'stale' generan alerta (tracking/no_data no molestan). */
export type AlertKind = 'met' | 'stale'

export interface TrackerAlert {
  tracker: Tracker
  kind: AlertKind
  /** Mensaje listo para mostrar. */
  message: string
  /** Ruta relativa con deep-link al tracker en el tablero. */
  href: string
}

/** Deep-link relativo al tracker dentro del tablero de seguimiento. */
export function trackerHref(trackerId: string): string {
  return `/seguimiento?t=${encodeURIComponent(trackerId)}`
}

function metMessage(tracker: Tracker, now: Date): string {
  const { daysUntil } = evaluateCondition(tracker, now)
  if (tracker.conditionKind === 'days_until_lt' && daysUntil != null) {
    return `Faltan ${daysUntil} días — se cruzó el umbral de ${tracker.conditionValue} para "${tracker.label}".`
  }
  const unit = tracker.unit ? ` ${tracker.unit}` : ''
  return `"${tracker.label}" cumplió la condición: ${tracker.currentValue}${unit} (${conditionLabel(tracker)}).`
}

function staleMessage(tracker: Tracker): string {
  return `"${tracker.label}" está desactualizado (cadencia ${tracker.cadenceDays} días). Subí una captura nueva.`
}

/** Alertas vivas para in-app (Señales / tablero). Una por tracker como mucho. */
export function buildTrackerAlerts(trackers: Tracker[], now: Date): TrackerAlert[] {
  const out: TrackerAlert[] = []
  for (const tracker of trackers) {
    const status = trackerStatus(tracker, now)
    if (status === 'met') {
      out.push({ tracker, kind: 'met', message: metMessage(tracker, now), href: trackerHref(tracker.id) })
    } else if (status === 'stale') {
      out.push({ tracker, kind: 'stale', message: staleMessage(tracker), href: trackerHref(tracker.id) })
    }
  }
  return out
}

/**
 * ¿Mandar email para este tracker ahora? Idempotente: sólo si la alerta vigente
 * (met/stale) DIFIERE de la última notificada (lastAlertKind). Así no se re-manda
 * el mismo aviso en cada corrida del cron; sí se manda si el estado cambió (ej.
 * pasó de stale a met, o se volvió a cumplir tras haber dejado de cumplirse).
 */
export function shouldSendEmail(tracker: Tracker, now: Date): AlertKind | null {
  const cond = evaluateCondition(tracker, now)
  if (cond.met) {
    return tracker.lastAlertKind === 'met' ? null : 'met'
  }
  if (isStale(tracker, now)) {
    return tracker.lastAlertKind === 'stale' ? null : 'stale'
  }
  return null
}

export interface EmailPayload {
  subject: string
  text: string
  html: string
  href: string
}

/** Une baseUrl (sin barra final) con una ruta relativa. */
export function absoluteUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '')
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

/** Construye el correo (subject + text + html) con deep-link absoluto al tablero. */
export function buildEmailPayload(
  tracker: Tracker,
  kind: AlertKind,
  baseUrl: string,
  now: Date,
): EmailPayload {
  const href = absoluteUrl(baseUrl, trackerHref(tracker.id))
  const message = kind === 'met' ? metMessage(tracker, now) : staleMessage(tracker)
  const subject =
    kind === 'met'
      ? `✅ ${tracker.label} — condición cumplida`
      : `⏳ ${tracker.label} — desactualizado`
  const text = `${message}\n\nVer en el tablero: ${href}`
  const html =
    `<p>${escapeHtml(message)}</p>` +
    `<p><a href="${href}">Abrir el tracker en el tablero →</a></p>`
  return { subject, text, html, href }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
