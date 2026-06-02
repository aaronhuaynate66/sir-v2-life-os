// SIR V2 — Tipos del extractor Instagram profile.
//
// Captura: pantalla de PERFIL de Instagram (no de feed, no de un post).
// Layout esperado: foto circular + @handle + boton Follow + 3 contadores
// (posts/followers/following) + bio + grid de posts.
//
// Materializado como `data` JSON dentro de un row observations con
// capture_type='instagram'.

import type { Confidence } from '../observations/types'
import type { InstagramMutualFollowers } from './mutual'

export interface InstagramProfileExtracted {
  /** @handle SIN el @. Copia literal lowercased/cased igual que aparece. */
  handle: string
  /** Nombre real visible debajo del handle (puede tener emojis). null si
   *  no aparece. */
  displayName: string | null
  /** Bio multi-linea, completa. null si vacia. */
  bio: string | null
  /** Link externo en la bio (URL completa, copiar literal). null si no esta. */
  externalLink: string | null
  /** Pronouns visibles ("she/her", "they/them"). null si no estan. */
  pronouns: string | null
  /** Cargo / negocio listado debajo del nombre (cuando es cuenta profesional).
   *  null si no aparece. */
  category: string | null
  /** Cuentas de posts. Acepta sufijos abreviados — el modelo debe expandir
   *  "1.2k" -> 1200, "12M" -> 12000000. null si no es visible. */
  postsCount: number | null
  /** Followers. Mismo manejo de sufijos. null si no visible. */
  followersCount: number | null
  /** Following. Mismo manejo de sufijos. null si no visible. */
  followingCount: number | null
  /** True si el badge "verified" (check azul) aparece junto al handle. */
  isVerified: boolean
  /** True si la cuenta esta marcada como privada (icono de candado). */
  isPrivate: boolean
  /** True si tiene foto de perfil (no avatar default). */
  hasProfilePhoto: boolean
  /** Línea de "seguidores en común" copiada LITERAL desde la imagen
   *  ("its_almendrita, adrian.prog y 12 más siguen esta cuenta" /
   *  "Followed by X, Y and N others"). null si la línea no aparece (típico
   *  cuando es la cuenta propia o no hay seguidores en común). El parseo a
   *  estructura lo hace `parseMutualFollowers` durante el sanitize. */
  mutualFollowersText: string | null
  /** Versión estructurada de mutualFollowersText (handles nombrados + conteo
   *  total). Derivada determinísticamente; null si no hubo línea legible. */
  mutualFollowers: InstagramMutualFollowers | null
  confidence: Confidence
  /** Observaciones del modelo (campos cortados, ambiguedades). null si nada. */
  rawObservations: string | null
}

export interface InstagramExtractorError {
  error: string
  detail?: string
}
