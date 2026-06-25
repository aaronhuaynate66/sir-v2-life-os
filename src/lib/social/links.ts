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

/** Mapa de homóglifos (cirílico/griego que se ven como latinos) → ASCII.
 *  El OCR de capturas mete estos caracteres "fantasma" en los handles
 *  (ej. "@nicollemariahе" con una 'е' cirílica) y rompe el link. */
const CONFUSABLES: Record<string, string> = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y', 'к': 'k',
  'м': 'm', 'н': 'h', 'т': 't', 'в': 'b', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd',
  'ո': 'n', 'г': 'r', 'А': 'A', 'Е': 'E', 'О': 'O', 'Р': 'P', 'С': 'C', 'Х': 'X',
  'У': 'Y', 'К': 'K', 'М': 'M', 'Н': 'H', 'Т': 'T', 'В': 'B',
  'ο': 'o', 'α': 'a', 'ε': 'e', 'ρ': 'p', 'ν': 'v', 'ι': 'i', 'κ': 'k', 'μ': 'm',
  'τ': 't', 'γ': 'y', 'υ': 'u',
}
function deconfuse(s: string): string {
  let out = ''
  for (const ch of s) out += CONFUSABLES[ch] ?? ch
  return out
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
  // Saneo: homóglifos → ASCII + solo chars válidos de handle (letras/dígitos/._).
  h = deconfuse(h).replace(/[^a-zA-Z0-9._]/g, '')
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
