// SIR V2 — Tests del person matcher (auto-link + ranking).
//
// Pieza crítica: decide si una captura se AUTO-VINCULA a una persona
// existente. Un regression silencioso acá vincula a la persona equivocada
// (o falla en vincular). Ya tuvo un bug real (BUG-002): el matching
// unidireccional NO encontraba cuando el query era más largo que el row
// guardado ("diana carolina diaz sanchez" vs row "diana carolina").
//
// Las normalizaciones se testean directo (exportadas). El scoring +
// política de auto-link se testea por la API pública findCandidates con un
// SupabaseClient falso (sin refactor de producción).

import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  normalizeName,
  normalizeHandle,
  normalizeLinkedInUrl,
  normalizePhone,
  buildContext,
  findCandidates,
} from './matcher'

// ─── normalizaciones puras ───────────────────────────────────────────

describe('normalizePhone — heurísticas Perú (ejemplos del contrato)', () => {
  it('formato internacional con espacios', () => {
    expect(normalizePhone('+51 999 888 777')).toBe('+51999888777')
  })
  it('local con 0 inicial y paréntesis/guiones → quita 0, asume +', () => {
    expect(normalizePhone('(051) 999-888-777')).toBe('+51999888777')
  })
  it('9 dígitos arrancando en 9 → asume +51 (Perú)', () => {
    expect(normalizePhone('999 888 777')).toBe('+51999888777')
  })
  it('prefijo internacional 00X → +X', () => {
    expect(normalizePhone('0051999888777')).toBe('+51999888777')
  })
  it('número no peruano con +', () => {
    expect(normalizePhone('+1 (555) 123-4567')).toBe('+15551234567')
  })
  it('vacío o basura no numérica → ""', () => {
    expect(normalizePhone('')).toBe('')
    expect(normalizePhone('abc-def')).toBe('')
  })
})

describe('normalizeName', () => {
  it('folds diacríticos (Díaz → Diaz)', () => {
    expect(normalizeName('Díaz')).toBe('Diaz')
  })
  it('strip de emojis/ruido y colapso de espacios', () => {
    expect(normalizeName('  Ana 😀  María  ')).toBe('Ana Maria')
  })
  it('conserva dígitos, @, ., _, -, comilla', () => {
    expect(normalizeName("O'Brien-2 @x._")).toBe("O'Brien-2 @x._")
  })
})

describe('normalizeHandle / normalizeLinkedInUrl', () => {
  it('handle: quita @, lowercase, trim', () => {
    expect(normalizeHandle('@JohnDoe ')).toBe('johndoe')
    expect(normalizeHandle('PlainHandle')).toBe('plainhandle')
  })
  it('linkedin: lowercase + colapsa slash final', () => {
    expect(normalizeLinkedInUrl('https://LinkedIn.com/in/Foo///')).toBe('https://linkedin.com/in/foo')
  })
})

describe('buildContext — gating por longitud mínima', () => {
  it('descarta señales demasiado cortas', () => {
    const ctx = buildContext({ name: 'A', handle: 'x', linkedinUrl: 'abc', phone: '12' })
    expect(ctx.name).toBeUndefined()
    expect(ctx.handle).toBeUndefined()
    expect(ctx.linkedinUrl).toBeUndefined()
    expect(ctx.phone).toBeUndefined()
  })
  it('acepta señales válidas, normalizadas', () => {
    const ctx = buildContext({ name: 'Al', handle: '@Bob', linkedinUrl: 'https://linkedin.com/in/x' })
    expect(ctx.name).toBe('al')
    expect(ctx.handle).toBe('bob')
    expect(ctx.linkedinUrl).toBe('https://linkedin.com/in/x')
  })
})

// ─── scoring + auto-link vía findCandidates ──────────────────────────

interface RowOverrides {
  id?: string
  name?: string | null
  slug?: string | null
  alias?: string | null
  instagram_handle?: string | null
  linkedin_url?: string | null
  phone_number?: string | null
}

function row(o: RowOverrides) {
  return {
    id: o.id ?? 'p1',
    name: o.name ?? null,
    slug: o.slug ?? null,
    alias: o.alias ?? null,
    relationship: null,
    category: null,
    importance_score: null,
    instagram_handle: o.instagram_handle ?? null,
    linkedin_url: o.linkedin_url ?? null,
    phone_number: o.phone_number ?? null,
  }
}

/** SupabaseClient falso: .from().select().eq() resuelve a {data, error}. */
function fakeSupabase(rows: ReturnType<typeof row>[]): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: rows, error: null }),
      }),
    }),
  } as unknown as SupabaseClient
}

describe('findCandidates — auto-link (solo identificadores exactos)', () => {
  it('handle exacto (case-insensitive) → auto-link', async () => {
    const sb = fakeSupabase([row({ id: 'p1', name: 'John', instagram_handle: '@johndoe' })])
    const r = await findCandidates(sb, 'u1', { handle: 'JohnDoe' })
    expect(r.autoLink).toEqual({ personId: 'p1', reason: 'exact_handle' })
    expect(r.candidates[0].matchScore).toBe(100)
  })

  it('teléfono exacto tras normalización (Perú) → auto-link', async () => {
    const sb = fakeSupabase([row({ id: 'p9', name: 'Maria', phone_number: '999888777' })])
    const r = await findCandidates(sb, 'u1', { phone: '+51 999 888 777' })
    expect(r.autoLink).toEqual({ personId: 'p9', reason: 'exact_phone' })
  })

  it('match por NOMBRE exacto → candidato pero NUNCA auto-link', async () => {
    // Tokens iguales en distinto orden → exact_name (score 95), isExactStrong false.
    const sb = fakeSupabase([row({ id: 'p2', name: 'Carolina Diana' })])
    const r = await findCandidates(sb, 'u1', { name: 'Diana Carolina' })
    expect(r.candidates[0].matchReason).toBe('exact_name')
    expect(r.candidates[0].matchScore).toBe(95)
    expect(r.autoLink).toBeNull()
  })
})

describe('findCandidates — BUG-002: matching bidireccional de tokens', () => {
  it('query MÁS LARGO que el row guardado igual matchea (name_prefix)', async () => {
    // El caso real: row "Diana Carolina", extractor "Diana Carolina Diaz Sanchez".
    const sb = fakeSupabase([row({ id: 'p3', name: 'Diana Carolina' })])
    const r = await findCandidates(sb, 'u1', { name: 'Diana Carolina Diaz Sanchez' })
    expect(r.candidates).toHaveLength(1)
    expect(r.candidates[0].matchReason).toBe('name_prefix')
    expect(r.autoLink).toBeNull() // nombre nunca auto-vincula
  })

  it('subconjunto de tokens en orden libre matchea (name_subset)', async () => {
    const sb = fakeSupabase([row({ id: 'p4', name: 'Diana Carolina Diaz Sanchez' })])
    const r = await findCandidates(sb, 'u1', { name: 'Carolina Diaz' })
    expect(r.candidates[0].matchReason).toBe('name_subset')
  })
})

describe('findCandidates — ranking y guardas', () => {
  it('ordena por score descendente', async () => {
    const sb = fakeSupabase([
      row({ id: 'weak', name: 'Diana' }), // name_prefix (70), score menor
      row({ id: 'strong', name: 'Diana Carolina' }), // exact_name (95)
    ])
    const r = await findCandidates(sb, 'u1', { name: 'Diana Carolina' })
    expect(r.candidates[0].id).toBe('strong')
    expect(r.candidates[0].matchScore).toBeGreaterThanOrEqual(r.candidates[1].matchScore)
  })

  it('sin señales suficientes → vacío, sin auto-link', async () => {
    const sb = fakeSupabase([row({ id: 'p1', name: 'John' })])
    const r = await findCandidates(sb, 'u1', { name: 'A' }) // <2 chars → sin señal
    expect(r.candidates).toEqual([])
    expect(r.autoLink).toBeNull()
  })

  it('descarta rows sin match (score 0)', async () => {
    const sb = fakeSupabase([row({ id: 'p1', name: 'Pedro Gomez' })])
    const r = await findCandidates(sb, 'u1', { name: 'Zoraida Quispe' })
    expect(r.candidates).toEqual([])
  })
})
