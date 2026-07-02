// SIR V2 — Cifrado de tokens OAuth para calendar_connections.
//
// Los access/refresh tokens NO deben quedar en texto plano en la DB. La RLS
// ya aísla por user_id, pero un dump de la DB sería un desastre. Usamos
// AES-256-GCM con una clave desde env (`CALENDAR_TOKEN_ENCRYPTION_KEY`).
//
// FALLBACK dev-friendly: si la env NO está, guardamos en Base64 con prefijo
// `plain:` y logueamos un warning. Funciona igual — pero al deploy debe
// setearse la clave. En prod SIN clave: WARNING nomás, no rompe.
//
// Formato serializado (siempre string ASCII, apto para columna TEXT):
//   `enc:v1:<iv_b64>:<ciphertext_b64>`   — modo cifrado real
//   `plain:v1:<plaintext_b64>`           — modo fallback (dev / sin clave)

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16

function getKey(): Buffer | null {
  const raw = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY?.trim()
  if (!raw) return null
  // Aceptamos el env en cualquier longitud: derivamos SHA-256 (32 bytes).
  return createHash('sha256').update(raw).digest()
}

/** Cifra un secreto para almacenar en DB. Devuelve una cadena portable. */
export function encryptToken(plaintext: string): string {
  if (!plaintext) return plaintext
  const key = getKey()
  if (!key) {
    // eslint-disable-next-line no-console
    console.warn('[calendar-oauth] CALENDAR_TOKEN_ENCRYPTION_KEY no setada; guardando token en Base64 (NO cifrado)')
    return `plain:v1:${Buffer.from(plaintext, 'utf8').toString('base64')}`
  }
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  const combined = Buffer.concat([enc, tag])
  return `enc:v1:${iv.toString('base64')}:${combined.toString('base64')}`
}

/** Descifra un valor almacenado. Devuelve null si el formato es inválido o
 *  la clave rotó (mejor null que un crash). */
export function decryptToken(stored: string | null | undefined): string | null {
  if (!stored) return null
  const s = String(stored)
  if (s.startsWith('plain:v1:')) {
    const b64 = s.slice('plain:v1:'.length)
    try { return Buffer.from(b64, 'base64').toString('utf8') } catch { return null }
  }
  if (!s.startsWith('enc:v1:')) return null
  const key = getKey()
  if (!key) {
    // eslint-disable-next-line no-console
    console.warn('[calendar-oauth] token cifrado en DB pero no hay CALENDAR_TOKEN_ENCRYPTION_KEY para descifrarlo')
    return null
  }
  const parts = s.split(':')
  if (parts.length !== 4) return null
  try {
    const iv = Buffer.from(parts[2], 'base64')
    const combined = Buffer.from(parts[3], 'base64')
    if (combined.length < TAG_LEN + 1) return null
    const ciphertext = combined.subarray(0, combined.length - TAG_LEN)
    const tag = combined.subarray(combined.length - TAG_LEN)
    const decipher = createDecipheriv(ALGO, key, iv)
    decipher.setAuthTag(tag)
    const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return dec.toString('utf8')
  } catch {
    return null
  }
}
