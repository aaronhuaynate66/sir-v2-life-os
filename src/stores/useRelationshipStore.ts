// SIR V2 — Relationship Store
// Manages people and relationships with Zustand + persist + Supabase sync (Sesion 20c)
//
// FK note: relationships.person_id REFERENCES people.id ON DELETE CASCADE.
// removePerson() locally cascades to relationships; the DB also cascades on
// the people.delete. As long as people upsert runs before relationships
// upsert on first push, FK constraints are satisfied. The engine fires
// bindings in array order via Promise.all, but per-binding upsert is
// independent; for a new person + relationship created in the same tick,
// the upserts arrive at Supabase in arbitrary order. Mitigation: define
// people binding FIRST so its slice's push starts first; the relationships
// FK constraint will reject the relationship upsert if it lands first and
// the retry will succeed once people lands.
'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Person, Relationship, PersonLink } from '@/types'
import { fixturePeople, fixtureRelationships } from '@/data/fixtures'
import { SEED_FIXTURES, purgeFixtureRows } from '@/data/fixtures/seed'
import { STORAGE_KEYS } from './storage'
import {
  attachSupabaseSync,
  personAdapter,
  relationshipAdapter,
  personLinkAdapter,
} from '@/lib/supabase/sync'

interface RelationshipState {
  people: Person[]
  relationships: Relationship[]
  /** Aristas de familia persona↔persona (migration 0035). */
  personLinks: PersonLink[]
}

interface RelationshipActions {
  addPerson: (person: Person) => void
  updatePerson: (id: string, patch: Partial<Person>) => void
  removePerson: (id: string) => void
  addRelationship: (rel: Relationship) => void
  updateRelationship: (id: string, patch: Partial<Relationship>) => void
  removeRelationship: (id: string) => void
  addPersonLink: (link: PersonLink) => void
  removePersonLink: (id: string) => void
  resetToFixtures: () => void
  clearAll: () => void
}

export type RelationshipStore = RelationshipState & RelationshipActions

// Fixtures SOLO fuera de producción (SEED_FIXTURES). En prod el estado
// inicial es vacío: la data real llega del DB vía el sync engine.
const INITIAL_STATE: RelationshipState = SEED_FIXTURES
  ? { people: fixturePeople, relationships: fixtureRelationships, personLinks: [] }
  : { people: [], relationships: [], personLinks: [] }

export const useRelationshipStore = create<RelationshipStore>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,

      addPerson: (person) =>
        set((s) => ({ people: [...s.people, person] })),

      updatePerson: (id, patch) =>
        set((s) => ({
          people: s.people.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),

      removePerson: (id) =>
        set((s) => ({
          people: s.people.filter((p) => p.id !== id),
          relationships: s.relationships.filter((r) => r.personId !== id),
          // Cascade local de aristas de familia (la FK en DB también cascada).
          personLinks: (s.personLinks ?? []).filter(
            (l) => l.personAId !== id && l.personBId !== id,
          ),
        })),

      addRelationship: (rel) =>
        set((s) => ({ relationships: [...s.relationships, rel] })),

      updateRelationship: (id, patch) =>
        set((s) => ({
          relationships: s.relationships.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        })),

      removeRelationship: (id) =>
        set((s) => ({ relationships: s.relationships.filter((r) => r.id !== id) })),

      addPersonLink: (link) =>
        set((s) => ({ personLinks: [...s.personLinks, link] })),

      removePersonLink: (id) =>
        set((s) => ({ personLinks: s.personLinks.filter((l) => l.id !== id) })),

      resetToFixtures: () => set(INITIAL_STATE),

      clearAll: () => set({ people: [], relationships: [], personLinks: [] }),
    }),
    {
      name: STORAGE_KEYS.RELATIONSHIP,
      // v1: purga fixtures sembrados en localStorage de clientes viejos
      // (deuda split-brain). Corre en rehidratación, ANTES de que el sync
      // engine suscriba — así no dispara DELETE de filas reales (Diana).
      version: 1,
      migrate: (state) => {
        if (!state || typeof state !== 'object') return state
        const s = state as Partial<RelationshipState>
        return {
          ...(state as object),
          people: purgeFixtureRows(s.people),
          relationships: purgeFixtureRows(s.relationships),
        } as RelationshipState
      },
    }
  )
)

attachSupabaseSync({
  store: useRelationshipStore,
  bindings: [
    {
      label: 'people',
      select: (s) => s.people,
      apply: (items) => useRelationshipStore.setState({ people: items }),
      adapter: personAdapter,
    },
    {
      label: 'relationships',
      select: (s) => s.relationships,
      apply: (items) => useRelationshipStore.setState({ relationships: items }),
      adapter: relationshipAdapter,
    },
    // person_links DESPUÉS de people: la FK person_links.person_*_id → people.id
    // necesita que la persona exista; si el upsert del link llega primero, el
    // engine reintenta y pasa cuando people aterriza (mismo patrón que rels).
    {
      label: 'personLinks',
      select: (s) => s.personLinks ?? [],
      apply: (items) => useRelationshipStore.setState({ personLinks: items }),
      adapter: personLinkAdapter,
    },
  ],
})
