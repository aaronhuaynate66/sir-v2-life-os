// SIR V2 — Fechas relevantes por ROL / RUBRO (motor proactivo).
//
// Lee identity_profile.roles (texto libre tipo "Fundador de Marlab", "Atleta
// de taekwondo", "Bombero") y vigila las fechas que importan a lo que Aaron
// HACE, no sólo a su gente:
//
//   • comercial  → calendario comercial de Perú (Día de la Madre, Black Friday,
//                  Navidad…) con una sugerencia accionable ligada, si existe, a
//                  un objetivo comercial activo ("¿Campaña para <objetivo>?").
//   • atleta/    → countdown al Mundial WFG26 (Juegos Mundiales de Bomberos,
//     bombero      5–13 nov 2026). Los deadlines del objetivo (visa, inscripción,
//                  pasaje) ya viven como tareas con fecha y los superficia
//                  buildAgenda; acá sólo agregamos el HITO del evento en sí.
//   • bombero    → sin calendario hardcodeado propio más allá del WFG26 (no hay
//                  una fuente clara de fechas del rol; no inventamos).
//
// PURO + determinístico: `now` inyectable, sin I/O ni LLM. La detección de
// rubro es tolerante (sin acentos, por palabra clave) para no exigir un formato
// rígido en el texto libre de los roles.

import type { Goal } from '@/types'
import {
  PERU_COMMERCIAL_CALENDAR,
  nextCommercialOccurrence,
} from '@/data/commercialCalendar'

const DAY_MS = 86_400_000

export type RoleRubro = 'athlete' | 'commercial' | 'firefighter'

/** Hito del Mundial de Bomberos (WFG26): evento ÚNICO 5–13 nov 2026. Editable
 *  acá si cambia la sede/fecha de la próxima edición. */
const WFG26 = {
  id: 'wfg26',
  label: 'Mundial WFG26',
  /** Fecha de INICIO (medianoche local). */
  start: { year: 2026, month: 10, day: 5 },
  rangeLabel: '5–13 nov 2026',
  /** Anticipación con la que vale la pena tenerlo en el radar (medio año). */
  leadDays: 240,
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

/** Palabras clave por rubro (normalizadas, sin acentos). */
const RUBRO_KEYWORDS: Record<RoleRubro, string[]> = {
  athlete: ['atleta', 'deport', 'taekwondo', 'mundial', 'competidor', 'corredor', 'running', 'maraton'],
  commercial: ['marlab', 'comercial', 'ventas', 'negocio', 'fundador', 'emprend', 'ceo', 'empresa', 'botica', 'retail', 'marketing'],
  firefighter: ['bombero', 'firefighter', 'rescate'],
}

/**
 * Detecta los rubros presentes en los roles del perfil. Tolerante: hace match
 * por substring normalizado, así "Fundador de Marlab" → commercial y "Atleta
 * de taekwondo" → athlete. Devuelve un set sin duplicados.
 */
export function detectRubros(roles: string[] | undefined | null): Set<RoleRubro> {
  const found = new Set<RoleRubro>()
  if (!roles) return found
  const blob = roles.map(normalize).join(' · ')
  for (const rubro of Object.keys(RUBRO_KEYWORDS) as RoleRubro[]) {
    if (RUBRO_KEYWORDS[rubro].some((kw) => blob.includes(kw))) found.add(rubro)
  }
  return found
}

export interface RoleDateHit {
  /** Id estable (para keys + dedupe). */
  id: string
  /** Título para UI ("Black Friday", "Mundial WFG26"). */
  title: string
  /** Días hasta la fecha (0 = hoy, >0 futuro). */
  daysUntil: number
  /** Sugerencia accionable ("¿Campaña para <objetivo>?"). */
  hint: string
  rubro: RoleRubro
}

export interface RoleDatesInput {
  roles: string[] | undefined | null
  /** Objetivos activos — para colgar una sugerencia comercial concreta. */
  goals?: Goal[]
}

/** medianoche local de hoy. */
function startOfDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/** Mejor objetivo comercial activo para enganchar una sugerencia de campaña:
 *  prioriza categoría financiera/career, y dentro de eso la mayor prioridad.
 *  Devuelve su título o null si no hay ninguno. */
function commercialGoalTitle(goals: Goal[] | undefined): string | null {
  if (!goals?.length) return null
  const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  const candidates = goals
    .filter((g) => g.status === 'active' && (g.category === 'financial' || g.category === 'career'))
    .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9))
  return candidates[0]?.title ?? null
}

/**
 * Construye las fechas por rubro vigentes HOY (dentro de su lead time), ordenadas
 * por cercanía ascendente. Vacío si los roles no matchean ningún rubro con
 * calendario (ej. sólo "Bombero" sin componente atleta → sólo WFG26).
 */
export function buildRoleDates(
  input: RoleDatesInput,
  now: Date = new Date(),
): RoleDateHit[] {
  const rubros = detectRubros(input.roles)
  const hits: RoleDateHit[] = []

  // Rubro comercial → calendario comercial de Perú.
  if (rubros.has('commercial')) {
    const goalTitle = commercialGoalTitle(input.goals)
    for (const ev of PERU_COMMERCIAL_CALENDAR) {
      const { daysUntil } = nextCommercialOccurrence(ev.spec, now)
      if (daysUntil > ev.leadDays) continue
      const hint = goalTitle ? `${ev.hint} · ¿Campaña para "${goalTitle}"?` : ev.hint
      hits.push({ id: `role_${ev.id}`, title: ev.label, daysUntil, hint, rubro: 'commercial' })
    }
  }

  // Mundial WFG26 → para atleta o bombero (son los Juegos Mundiales de Bomberos).
  if (rubros.has('athlete') || rubros.has('firefighter')) {
    const today = startOfDay(now)
    const start = new Date(WFG26.start.year, WFG26.start.month, WFG26.start.day)
    const daysUntil = Math.round((start.getTime() - today.getTime()) / DAY_MS)
    // Sólo mientras no haya terminado y esté dentro del horizonte de anticipación.
    if (daysUntil >= -8 && daysUntil <= WFG26.leadDays) {
      hits.push({
        id: WFG26.id,
        title: WFG26.label,
        daysUntil,
        hint: `Juegos Mundiales de Bomberos · ${WFG26.rangeLabel} · asegurá visa, inscripción y pasaje`,
        rubro: rubros.has('athlete') ? 'athlete' : 'firefighter',
      })
    }
  }

  hits.sort((a, b) => a.daysUntil - b.daysUntil)
  return hits
}
