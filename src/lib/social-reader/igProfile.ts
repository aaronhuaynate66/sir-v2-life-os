// SIR V2 — Normalización de los DATOS DE PERFIL que manda el reader de Instagram.
//
// Pedido de Aaron (issue #994): "si el reader ya revisa las historias y saca el
// user, ¿por qué no puede sacar de una vez la cantidad de seguidores,
// publicaciones, etc.?".
//
// La respuesta es que sí puede, y sin pedirle nada nuevo a Instagram: el reader
// es PASIVO (intercepta el JSON que IG ya le manda al navegador; hacer requests
// propios es lo que IG detecta y banea). Cuando Aaron entra a un perfil, esa
// respuesta YA trae nombre, bio, seguidores, publicaciones y categoría — pero el
// interceptor la descartaba porque solo miraba la barra de historias.
//
// Este módulo es la parte que tiene que ser CORRECTA, así que vive acá y es PURA:
// lo que llega del navegador es data hostil (shapes de IG que cambian solos,
// strings donde debería haber números, "1.2k" en vez de 1200, campos ausentes).
// Normaliza, valida y descarta lo que no sirve, en vez de escribir basura.
//
// Nombres de campo alineados con `InstagramProfileExtracted`
// (lib/capture/instagram/types.ts) para que el dato del reader y el de la captura
// por screenshot sean intercambiables.

/** Perfil ya normalizado y listo para persistir. */
export interface ReaderProfile {
  handle: string
  displayName: string | null
  bio: string | null
  category: string | null
  externalLink: string | null
  postsCount: number | null
  followersCount: number | null
  followingCount: number | null
  isVerified: boolean | null
  isBusiness: boolean | null
}

/** Lo que puede llegar del reader: todo opcional y de tipo incierto. */
export interface RawReaderProfile {
  handle?: unknown
  displayName?: unknown
  fullName?: unknown
  bio?: unknown
  biography?: unknown
  category?: unknown
  externalLink?: unknown
  postsCount?: unknown
  followersCount?: unknown
  followingCount?: unknown
  isVerified?: unknown
  isBusiness?: unknown
}

/** Tope de cordura: IG no tiene cuentas con más de mil millones de seguidores.
 *  Un número por encima de esto es un campo mal leído, no un dato. */
const MAX_COUNT = 1_000_000_000
const MAX_BIO = 1000
const MAX_SHORT = 200

/** Handle de IG válido: letras, números, punto y guion bajo, 1-30 chars. */
const HANDLE_RE = /^[a-z0-9._]{1,30}$/

export function canonProfileHandle(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const h = value.trim().replace(/^@/, '').toLowerCase()
  return HANDLE_RE.test(h) ? h : null
}

function str(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const s = value.replace(/\s+/g, ' ').trim()
  if (!s) return null
  return s.slice(0, max)
}

function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

/**
 * Cuenta numérica tolerante. IG a veces manda el número crudo (`1200`) y a veces
 * el texto abreviado que se ve en pantalla (`"1.2 k"`, `"12,3 mil"`, `"3.4M"`).
 * Devuelve null ante cualquier cosa que no sea una cuenta plausible — es
 * preferible no tener el dato que tener uno inventado.
 */
export function parseCount(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || value > MAX_COUNT) return null
    return Math.round(value)
  }
  if (typeof value !== 'string') return null

  const raw = value.trim().toLowerCase()
  if (!raw) return null

  const m = raw.match(/^([\d.,\s]+)\s*(k|m|mil|millones|millón|millon)?$/)
  if (!m) return null

  let digits = m[1].replace(/\s/g, '')
  const suffix = m[2]

  // Separadores: si hay coma Y punto, el ÚLTIMO es el decimal (cubre 1.234,56 y
  // 1,234.56). Con uno solo, es decimal si deja ≤2 dígitos detrás; si no, es
  // separador de miles ("1.234" = 1234, "1.2k" = 1200).
  const lastComma = digits.lastIndexOf(',')
  const lastDot = digits.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    const decSep = lastComma > lastDot ? ',' : '.'
    const thouSep = decSep === ',' ? '.' : ','
    digits = digits.split(thouSep).join('').replace(decSep, '.')
  } else {
    const sep = lastComma >= 0 ? ',' : lastDot >= 0 ? '.' : null
    if (sep) {
      const tail = digits.slice(digits.lastIndexOf(sep) + 1)
      digits = tail.length <= 2 && suffix
        ? digits.replace(sep, '.')
        : tail.length === 3
          ? digits.split(sep).join('')
          : digits.replace(sep, '.')
    }
  }

  const n = Number(digits)
  if (!Number.isFinite(n) || n < 0) return null

  const mult = suffix === 'k' ? 1_000
    : suffix === 'm' || suffix === 'millones' || suffix === 'millón' || suffix === 'millon' ? 1_000_000
      : suffix === 'mil' ? 1_000
        : 1
  const total = Math.round(n * mult)
  return total >= 0 && total <= MAX_COUNT ? total : null
}

/**
 * Normaliza lo que mandó el reader. Devuelve null si no hay handle válido (sin
 * handle el dato no se puede anclar a nada) o si el perfil no aporta NINGÚN
 * campo útil — no tiene sentido escribir una fila vacía.
 */
export function normalizeReaderProfile(raw: RawReaderProfile | null | undefined): ReaderProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const handle = canonProfileHandle(raw.handle)
  if (!handle) return null

  const profile: ReaderProfile = {
    handle,
    displayName: str(raw.displayName ?? raw.fullName, MAX_SHORT),
    bio: str(raw.bio ?? raw.biography, MAX_BIO),
    category: str(raw.category, MAX_SHORT),
    externalLink: str(raw.externalLink, MAX_SHORT),
    postsCount: parseCount(raw.postsCount),
    followersCount: parseCount(raw.followersCount),
    followingCount: parseCount(raw.followingCount),
    isVerified: bool(raw.isVerified),
    isBusiness: bool(raw.isBusiness),
  }

  // Un display name idéntico al handle no es un nombre — es el handle otra vez.
  // (IG rellena así muchas cuentas; guardarlo haría creer que ya está resuelta.)
  if (profile.displayName && profile.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '') === handle.replace(/[^a-z0-9]+/g, '')) {
    profile.displayName = null
  }

  const aportaAlgo =
    profile.displayName !== null || profile.bio !== null || profile.category !== null ||
    profile.externalLink !== null || profile.postsCount !== null ||
    profile.followersCount !== null || profile.followingCount !== null ||
    profile.isVerified !== null || profile.isBusiness !== null
  return aportaAlgo ? profile : null
}

/**
 * ¿Esta cuenta parece una ORGANIZACIÓN y no una persona?
 *
 * Es LA pregunta que hoy traba la bandeja: 130 cuentas sin identificar, y buena
 * parte no son gente sino negocios y fan pages que no vale la pena nombrar a
 * mano. Nadie con 50.000 seguidores es un contacto personal de Aaron.
 *
 * Heurística DECLARADA (no ciencia), conservadora y explicable: se pronuncia
 * solo cuando hay señal fuerte. Devuelve null cuando no hay elementos — mejor
 * callarse que clasificar mal a una persona como empresa.
 */
export const ORG_FOLLOWER_FLOOR = 10_000

export function looksLikeOrg(p: ReaderProfile): boolean | null {
  // Señal declarada por la propia IG: cuenta profesional con rubro.
  if (p.isBusiness === true && p.category) return true
  // Volumen: por encima del piso ya no es una relación personal.
  if (p.followersCount !== null && p.followersCount >= ORG_FOLLOWER_FLOOR) return true
  // Verificada con muchos seguidores es marca/figura pública, no contacto.
  if (p.isVerified === true && (p.followersCount ?? 0) >= 1_000) return true
  // Señal en contra: cuenta chica y sin rubro declarado → probablemente persona.
  if (p.isBusiness === false && p.followersCount !== null && p.followersCount < 2_000) return false
  return null
}
