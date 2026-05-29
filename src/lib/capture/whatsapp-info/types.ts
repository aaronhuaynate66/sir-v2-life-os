// SIR V2 — Tipos del extractor WhatsApp INFO (vista "Datos del contacto").
//
// A diferencia de whatsapp_chat (conversacion), esta captura es la pantalla
// de PERFIL del contacto: foto grande, nombre, numero de telefono, About,
// "Visto por ultima vez", grupos en comun, contactos en comun.
//
// Materializado como `data` JSON dentro de un row observations con
// capture_type='whatsapp_info'.

import type { Confidence } from '../observations/types'

/** Shape estricto del JSON que devuelve Claude Vision al procesar
 *  un screenshot de "Datos del contacto" de WhatsApp. */
export interface WhatsAppInfoExtracted {
  /** Nombre tal cual aparece grande debajo de la foto. Copia literal,
   *  conservando emojis. */
  displayName: string
  /** Telefono visible. Conservar formato exacto (puede tener "+", espacios,
   *  guiones, parentesis). null si no es legible o no esta. */
  phoneNumber: string | null
  /** Seccion "About" / "Acerca de" — texto literal. null si no aparece
   *  o esta vacia. */
  aboutText: string | null
  /** Linea de estado: "online", "last seen today at 14:23",
   *  "ultima vez ayer a las 22:10", etc. Copia literal. null si no esta. */
  lastSeen: string | null
  /** Numero de grupos en comun (si la fila se ve). null si no aparece. */
  groupsInCommonCount: number | null
  /** Numero de contactos en comun (si la fila se ve). null si no aparece. */
  contactsInCommonCount: number | null
  /** True si hay una foto de perfil visible (no avatar default gris). */
  hasProfilePhoto: boolean
  /** True si el perfil muestra badge de "Business" / cuenta business. */
  isBusinessAccount: boolean
  confidence: Confidence
  /** Notas que el modelo quiera dejar (campos cortados, ambiguedades). */
  rawObservations: string | null
}

/** Response de error generica para el extractor. */
export interface WhatsAppInfoError {
  error: string
  detail?: string
}
