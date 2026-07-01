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
  goalSuggested: 'goal_suggested',
  sirAsked: 'sir_asked',
  sirActionProposed: 'sir_action_proposed',
  sirActionConfirmed: 'sir_action_confirmed',
  sirGapAsked: 'sir_gap_asked',
  sirGapAnswered: 'sir_gap_answered',
  sirVoiceUsed: 'sir_voice_used',
  // Cockpit /horario — ver dónde clickea el usuario.
  horarioTaskClick: 'horario_task_click',
  // /relato Router 2b — visibilidad del funnel de captura por relato.
  relatoPlanSubmitted: 'relato_plan_submitted',
  relatoActionConfirmed: 'relato_action_confirmed',
  // BrainGlow F3 — adopción del feedback Hebbian.
  brainFeedbackGiven: 'brain_feedback_given',
  // Mission Control /panel — adopción del briefing IA + YearCompass.
  briefingGenerated: 'briefing_generated',
  yearCompassClick: 'year_compass_click',
  // /relaciones — bounce a la ficha detallada.
  personOpened: 'person_opened',
  // /oportunidades — creación/edición de deals.
  dealSaved: 'deal_saved',
} as const

// ─── TAXONOMÍA ESTÁNDAR ───────────────────────────────────────────────
// Convención:
//  - Nombre de evento: `objeto_accion` en snake_case (en EVENTS, única fuente).
//  - Parámetros obligatorios por familia:
//      · Capturas (capture_*): SIEMPRE `capture_type` + `surface`.
//      · Creación de entidad (*_created/_added): SIEMPRE `method`.
//  - Usar los wrappers tipados (trackCapture / trackCreated) para que el
//    compilador obligue a pasar esos params → no se vuelven a olvidar.

/** Superficie desde donde ocurre la acción (param `surface`). */
export type Surface =
  | 'ficha'        // PersonDetail
  | 'captura'      // /captura
  | 'intake'       // /relaciones/intake
  | 'objetivos'    // /objetivos
  | 'panel'        // Mission Control
  | 'relaciones'   // /relaciones
  | 'salud'        // /salud

/** Método de creación de una entidad (param `method`). */
export type CreateMethod =
  | 'form'         // formulario manual
  | 'texto_ia'     // "Contale a SIR" (relato → IA)
  | 'intake'       // intake inteligente
  | 'mencionada'   // auto-crear persona mencionada (PR-B)
  | 'captura'      // derivada de una captura
  | 'sir_chat'     // confirmada desde el chat de SIR

/** Captura: fuerza `capture_type` + `surface`. */
export function trackCapture(
  event: string,
  params: { capture_type: string; surface: Surface } & GtagParams,
): void {
  track(event, params)
}

/** Creación de entidad: fuerza `method`. */
export function trackCreated(
  event: string,
  params: { method: CreateMethod } & GtagParams,
): void {
  track(event, params)
}
