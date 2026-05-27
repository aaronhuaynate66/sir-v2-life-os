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
import type { Person, Relationship } from '@/types'
import { fixturePeople, fixtureRelationships } from '@/data/fixtures'
import { STORAGE_KEYS } from './storage'
import {
  attachSupabaseSync,
  personAdapter,
  relationshipAdapter,
} from '@/lib/supabase/sync'

interface RelationshipState {
  people: Person[]
  relationships: Relationship[]
}

interface RelationshipActions {
  addPerson: (person: Person) => void
  updatePerson: (id: string, patch: Partial<Person>) => void
  removePerson: (id: string) => void
  addRelationship: (rel: Relationship) => void
  updateRelationship: (id: string, patch: Partial<Relationship>) => void
  removeRelationship: (id: string) => void
  resetToFixtures: () => void
  clearAll: () => void
}

export type RelationshipStore = RelationshipState & RelationshipActions

const INITIAL_STATE: RelationshipState = {
  people: fixturePeople,
  relationships: fixtureRelationships,
}

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
        })),

      addRelationship: (rel) =>
        set((s) => ({ relationships: [...s.relationships, rel] })),

      updateRelationship: (id, patch) =>
        set((s) => ({
          relationships: s.relationships.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        })),

      removeRelationship: (id) =>
        set((s) => ({ relationships: s.relationships.filter((r) => r.id !== id) })),

      resetToFixtures: () => set(INITIAL_STATE),

      clearAll: () => set({ people: [], relationships: [] }),
    }),
    {
      name: STORAGE_KEYS.RELATIONSHIP,
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
  ],
})
