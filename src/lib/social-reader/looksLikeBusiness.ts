// SIR V2 — Heurística "¿parece cuenta de negocio?" para la bandeja ¿quién es
// quién?. Aaron: la bandeja le daba empresas que no son contactos. No se puede
// saber con certeza desde el handle, así que esto es una PISTA (soft): marca las
// probables-negocio, se ordenan al fondo y se pueden descartar en lote. Descartar
// NO es destructivo: si era una persona real, su próxima historia la reaparece.
// CONSERVADOR: mejor NO marcar (y que quede como persona) que ocultar un contacto.

const BIZ_KEYWORDS = [
  'uniforme', 'corporacion', 'corp', 'grupo', 'empresa', 'sac', 'eirl', 'srl',
  'store', 'tienda', 'shop', 'oficial', 'official', 'gear', 'maquila',
  'inmobiliaria', 'import', 'export', 'distribu', 'servicios', 'soluciones',
  'studio', 'estudio', 'clinica', 'dental', 'gym', 'fitness', 'boutique',
  'constructora', 'ferreteria', 'farmacia', 'restaurant', 'catering', 'eventos',
  'agencia', 'consultora', 'logistica', 'transporte', 'seguros', 'textil',
  'industrial', 'comercial', 'motors', 'autos', 'market', 'brand', 'company',
]

function squash(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

/**
 * ¿El handle/nombre parece una cuenta de negocio (no una persona)? Heurística
 * conservadora por palabras clave + sufijo de marca-país (".pe"/".peru"). Si una
 * fila ya tiene sugerencia de contacto, NO la trates como negocio (matchea a
 * alguien) — eso lo decide quien llama.
 */
export function looksLikeBusiness(input: { handle: string | null; name: string | null }): boolean {
  const raw = `${input.handle ?? ''} ${input.name ?? ''}`.toLowerCase()
  const nameTokens = (input.name ?? '').trim().split(/\s+/).filter(Boolean)
  // Sufijo de marca-país típico de negocios peruanos ("algo.pe", "algo.peru")
  // SOLO si no hay un nombre propio de 2+ palabras (una persona con nombre
  // completo no se marca aunque su handle tenga "peru").
  if (/(\.pe\b|\.pe_|\.peru|_pe\b|\bperu\b)/.test(raw) && nameTokens.length < 2) return true
  const blob = squash(raw)
  return BIZ_KEYWORDS.some((k) => blob.includes(k))
}
