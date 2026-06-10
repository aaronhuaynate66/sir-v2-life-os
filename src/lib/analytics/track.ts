// SIR V2 — Wrapper de tracking GA4 (gtag). Punto ÚNICO para emitir eventos.
//
// - No-op seguro: si gtag no cargó (env sin NEXT_PUBLIC_GA4_ID, adblock, SSR),
//   no rompe nada. Nunca tira.
// - Nombres de evento centralizados (EVENTS) para no tipear strings sueltos en
//   cada componente y poder auditar qué se mide desde un solo lugar.
// - SPA: el page_view automático de gtag('config') está DESACTIVADO
//   (send_page_view:false en layout.tsx); acá lo emitimos en cada cambio de
//   ruta, así GA4 ve el recorrido real y no solo la página de entrada.

type GtagParams = Record<string, string | number | boolean | undefined | null>

declare global {
  interface Window {
    gtag?: (command: string, eventOrId: string, params?: GtagParams) => void
  }
}

function hasGtag(): boolean {
  return typeof window !== 'undefined' && typeof window.gtag === 'function'
}

/** Emite un evento custom a GA4. Silencioso si gtag no está disponible. */
export function track(event: string, params?: GtagParams): void {
  if (!hasGtag()) return
  try {
    window.gtag!('event', event, params ?? {})
  } catch {
    /* nunca romper la app por analytics */
  }
}

/** Emite un page_view manual (SPA). Llamar en cada cambio de ruta. */
export function trackPageView(path: string): void {
  if (!hasGtag()) return
  try {
    window.gtag!('event', 'page_view', {
      page_path: path,
      page_location: typeof window !== 'undefined' ? window.location.href : path,
      page_title: typeof document !== 'undefined' ? document.title : undefined,
    })
  } catch {
    /* noop */
  }
}

/** Catálogo de eventos de SIR (loop central). Mantener acá para auditar. */
export const EVENTS = {
  captureStarted: 'capture_started',
  captureSaved: 'capture_saved',
  exportUploaded: 'whatsapp_export_uploaded',
  personAdded: 'person_added',
  familyLinkAdded: 'family_link_added',
  messageGenerated: 'message_generated',
  interactionLogged: 'interaction_logged',
  habitChecked: 'habit_checked',
  moodLogged: 'mood_logged',
  objectiveCreated: 'objective_created',
  stepCompleted: 'step_completed',
  searchPerformed: 'search_performed',
} as const
