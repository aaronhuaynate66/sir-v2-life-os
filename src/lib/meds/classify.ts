// SIR V2 — Inteligencia de medicación (puro).
//
// Una toma (med_intakes) por sí sola es un nombre + hora. Para que SIR CRUCE
// bien, necesita saber QUÉ es cada medicamento: su composición y para qué es.
// Ese "desglose" lo carga Aaron en med_registry (component / drug_class /
// treats); acá lo convertimos en SEÑAL clínica.
//
// Clave: un medicamento ESPECÍFICO de migraña (ergotamina, triptanes) solo se
// toma cuando hay migraña → su toma es una señal inequívoca de migraña, y la
// HORA marca el inicio. Un analgésico general (ibuprofeno) NO: puede ser por
// cualquier dolor, así que NO marca "día de migraña" (antes se contaba TODA
// toma como migraña → contaminaba los cruces con FC/sueño). Este módulo corrige
// eso: `deriveMigraineDays` cuenta solo los antimigrañosos.

export type MedClass = 'antimigraine' | 'analgesic' | 'supplement' | 'other'

/** Fila de "mis medicamentos" con el desglose opcional que carga el usuario. */
export interface RegistryEntry {
  name: string
  dose?: string | null
  /** Composición: "ergotamina tartrato 1mg + cafeína 100mg". */
  component?: string | null
  /** Clase declarada por el usuario (texto libre): "antimigrañoso", "analgésico"… */
  drugClass?: string | null
  /** Para qué es: "migraña", "dolor de cabeza"… */
  treats?: string | null
  note?: string | null
}

export interface MedInfo {
  class: MedClass
  /** true = específico de migraña (ergotamina/triptán o treats=migraña). */
  isMigraineMed: boolean
  /** Etiqueta legible de la clase (ES). */
  classLabel: string
  /** Para qué, si se sabe. */
  treats: string | null
  /** Composición, si se sabe. */
  component: string | null
}

const CLASS_LABEL: Record<MedClass, string> = {
  antimigraine: 'antimigrañoso',
  analgesic: 'analgésico',
  supplement: 'suplemento',
  other: 'medicamento',
}

// Principios activos ESPECÍFICOS de migraña (tomarlos ⇒ migraña).
const MIGRAINE_KEYS = [
  'ergotamina', 'ergotamin', 'ergonex', 'cafergot', 'tonopan', 'migrastop',
  'dihidroergotamina', 'dhe',
  'triptan', 'triptán', 'sumatript', 'rizatript', 'zolmitript', 'naratript',
  'almotript', 'eletript', 'frovatript',
]
// Analgésicos / AINEs generales (dolor, no específicos de migraña).
const ANALGESIC_KEYS = [
  'ibuprofeno', 'ibuprofen', 'advil', 'naproxeno', 'naproxen', 'aleve',
  'ketorolaco', 'ketoprofeno', 'diclofenaco', 'paracetamol', 'acetaminofen',
  'acetaminofén', 'panadol', 'aspirina', 'acetilsalicil', 'metamizol',
  'dipirona', 'celecoxib', 'meloxicam',
]
const SUPPLEMENT_KEYS = [
  'magnesio', 'riboflavina', 'vitamina', 'omega', 'coenzima', 'q10',
  'melatonina', 'complejo b', 'colageno', 'colágeno',
]
const MIGRAINE_CONDITION_KEYS = ['migrañ', 'migran', 'migrain', 'cefalea', 'jaqueca']

function norm(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

function classFromText(text: string): MedClass | null {
  if (MIGRAINE_KEYS.some((k) => text.includes(norm(k)))) return 'antimigraine'
  if (ANALGESIC_KEYS.some((k) => text.includes(norm(k)))) return 'analgesic'
  if (SUPPLEMENT_KEYS.some((k) => text.includes(norm(k)))) return 'supplement'
  return null
}

/** Mapea la clase de texto libre que escribió el usuario a un MedClass. */
function classFromUserLabel(raw: string): MedClass | null {
  const s = norm(raw)
  if (!s) return null
  if (s.includes('antimigr') || s.includes('ergot') || s.includes('triptan') || s.includes('triptán')) return 'antimigraine'
  if (s.includes('analges') || s.includes('aine') || s.includes('nsaid') || s.includes('antiinflam')) return 'analgesic'
  if (s.includes('suplement') || s.includes('vitamin')) return 'supplement'
  return null
}

/**
 * Clasifica un medicamento. El DESGLOSE del usuario (registry) manda; si no hay,
 * cae a keywords sobre el nombre. Determinístico.
 */
export function classifyMed(name: string, entry?: RegistryEntry | null): MedInfo {
  const treats = entry?.treats?.trim() || null
  const component = entry?.component?.trim() || null

  // 1) Clase: preferimos la declarada por el usuario; luego composición; luego nombre.
  let cls: MedClass | null = null
  if (entry?.drugClass) cls = classFromUserLabel(entry.drugClass)
  if (!cls && component) cls = classFromText(norm(component))
  if (!cls) cls = classFromText(norm(name))
  const resolved: MedClass = cls ?? 'other'

  // 2) ¿Específico de migraña? Clase antimigraña, o el usuario dice que trata migraña.
  const treatsMigraine = MIGRAINE_CONDITION_KEYS.some((k) => norm(treats).includes(k))
  const isMigraineMed = resolved === 'antimigraine' || treatsMigraine

  return {
    class: resolved,
    isMigraineMed,
    classLabel: CLASS_LABEL[resolved],
    treats,
    component,
  }
}

/** Índice name→entry (case-insensitive) del registro de medicamentos. */
export function registryMap(entries: RegistryEntry[]): Map<string, RegistryEntry> {
  const m = new Map<string, RegistryEntry>()
  for (const e of entries) if (e?.name) m.set(norm(e.name), e)
  return m
}

export interface IntakeLike {
  name: string
  /** ISO o YYYY-MM-DD. Se usa el prefijo de fecha (día local ya resuelto aguas arriba). */
  taken_at: string
}

/**
 * Días (YYYY-MM-DD) con al menos una toma de un medicamento ESPECÍFICO de
 * migraña. Reemplaza el "toda toma = migraña" que contaminaba los cruces.
 */
export function deriveMigraineDays(intakes: IntakeLike[], registry: Map<string, RegistryEntry>): Set<string> {
  const out = new Set<string>()
  for (const it of intakes) {
    const day = (it.taken_at || '').slice(0, 10)
    if (!day) continue
    const info = classifyMed(it.name, registry.get(norm(it.name)))
    if (info.isMigraineMed) out.add(day)
  }
  return out
}

/**
 * Frase corta para mostrar el SIGNIFICADO de una toma en la vista del día.
 * Ej. "antimigrañoso — señal de migraña" o "analgésico · dolor".
 */
export function medMeaning(name: string, entry?: RegistryEntry | null): string {
  const info = classifyMed(name, entry)
  if (info.isMigraineMed) {
    const base = 'antimigrañoso — señal de migraña'
    return info.component ? `${base} (${info.component})` : base
  }
  const parts = [info.classLabel]
  if (info.treats) parts.push(info.treats)
  return parts.join(' · ')
}
