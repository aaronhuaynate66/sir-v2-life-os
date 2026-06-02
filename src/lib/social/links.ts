// SIR V2 — Normalización de enlaces a redes/contacto.
//
// Helpers puros para construir URLs externas desde los campos sociales de
// una persona (people.phone_number / instagram_handle / linkedin_url /
// twitter_handle, migration 0010). Reusados por RedesSociales (#11) y el
// botón Chat WhatsApp (#16).

/** Deja solo dígitos (wa.me espera el número en formato internacional sin
 *  símbolos). Devuelve null si no queda nada usable. */
export function normalizePhoneDigits(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 7 ? digits : null
}

/** Link wa.me a partir de un teléfono libre. null si el teléfono no sirve. */
export function whatsappLink(phone: string | null | undefined): string | null {
  const digits = normalizePhoneDigits(phone)
  return digits ? `https://wa.me/${digits}` : null
}

/** Normaliza un handle quitando @, espacios y una posible URL pegada. */
export function normalizeHandle(raw: string | null | undefined): string | null {
  if (!raw) return null
  let h = raw.trim()
  if (!h) return null
  // Si pegaron una URL completa, quedarnos con el último segmento.
  const urlMatch = h.match(/(?:instagram\.com|twitter\.com|x\.com)\/(@?[\w.]+)/i)
  if (urlMatch) h = urlMatch[1]
  h = h.replace(/^@/, '').replace(/\/$/, '').trim()
  return h.length > 0 ? h : null
}

export function instagramLink(handle: string | null | undefined): string | null {
  const h = normalizeHandle(handle)
  return h ? `https://instagram.com/${h}` : null
}

export function twitterLink(handle: string | null | undefined): string | null {
  const h = normalizeHandle(handle)
  return h ? `https://x.com/${h}` : null
}

/** Lee + normaliza el `handle` del JSON de una observation `instagram`
 *  (data es Record<string, unknown> — coerción defensiva). null si no hay. */
export function instagramHandleFromExtracted(
  extracted: Record<string, unknown> | null | undefined,
): string | null {
  if (!extracted) return null
  const raw = typeof extracted.handle === 'string' ? extracted.handle : null
  return normalizeHandle(raw)
}

/**
 * Decide si auto-vincular el Instagram extraído de una captura al campo
 * `people.instagram_handle`. Paridad V1: el usuario sube la captura de su
 * perfil de Insta y el handle/enlace se carga SOLO. Regla:
 *   - Si la persona YA tiene un handle cargado → no pisamos (devolvemos null).
 *   - Si no, devolvemos el handle normalizado de la captura (o null si no hay).
 * PURA → testeable sin tocar el store.
 */
export function resolveInstagramAutoLink(
  currentHandle: string | null | undefined,
  extracted: Record<string, unknown> | null | undefined,
): string | null {
  if (normalizeHandle(currentHandle)) return null
  return instagramHandleFromExtracted(extracted)
}

/** Valida superficialmente una URL http(s). Devuelve la URL trim o null. */
export function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  const u = raw.trim()
  if (!u) return null
  if (/^https?:\/\//i.test(u)) return u
  // Tolerar que peguen "linkedin.com/in/..." sin esquema.
  if (/^[\w-]+\.[\w.]+\//.test(u)) return `https://${u}`
  return u
}
