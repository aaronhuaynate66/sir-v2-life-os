// SIR V2 — Tipos del extractor WhatsApp WEB (escritorio, 3 columnas).
//
// Reusa la shape de la conversación de whatsapp_chat (WhatsAppCaptureExtracted)
// — mensajes, personName, summary, topics, estados emocionales, fecha — para
// que el dato fluya igual a los consumidores (LastInteraction, síntesis,
// resumen). AGREGA `phoneNumber`: WhatsApp Web suele mostrar el número del
// contacto en el panel "Info. del contacto" de la derecha, que el chat móvil
// no tiene. Sirve para el matcher (auto-link por teléfono).

import type { WhatsAppCaptureExtracted } from '../whatsapp/types'

export interface WhatsAppWebExtracted extends WhatsAppCaptureExtracted {
  /** Teléfono del contacto leído del panel derecho "Info. del contacto"
   *  (formato +51 9XX XXX XXX). null si el panel no está abierto o no es
   *  legible. */
  phoneNumber: string | null
}
