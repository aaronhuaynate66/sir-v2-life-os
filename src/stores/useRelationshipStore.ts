// SIR V2 — Relationship Store
// Manages people and relationships with Zustand + persist
'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Person, Relationship } from '@/types'
import { fixturePeople, fixtureRelationships } from '@/data/fixtures'
import { STORAGE_KEYS } from './storage'

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
