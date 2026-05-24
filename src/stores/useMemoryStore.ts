// SIR V2 — Memory Store
// Manages memories with Zustand + persist
'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Memory } from '@/types'

interface MemoryState {
    memories: Memory[]
}

interface MemoryActions {
    addMemory: (memory: Memory) => void
    updateMemory: (id: string, patch: Partial<Memory>) => void
    removeMemory: (id: string) => void
    queryMemories: (query: string) => Memory[]
    getRecentMemories: (limit?: number) => Memory[]
    getMemoriesByEntity: (entityId: string) => Memory[]
    getMemoriesByType: (type: Memory['type']) => Memory[]
    resetToFixtures: () => void
    clearAll: () => void
}

export type MemoryStore = MemoryState & MemoryActions

const INITIAL_STATE: MemoryState = {
    memories: [],
}

export const useMemoryStore = create<MemoryStore>()(
    persist(
          (set, get) => ({
                  ...INITIAL_STATE,

                  addMemory: (memory) =>
                            set((s) => ({ memories: [...s.memories, memory] })),

                  updateMemory: (id, patch) =>
                            set((s) => ({
                                        memories: s.memories.map((m) =>
                                                      m.id === id ? { ...m, ...patch } : m
                                                                           ),
                            })),

                  removeMemory: (id) =>
                            set((s) => ({ memories: s.memories.filter((m) => m.id !== id) })),

                  queryMemories: (query) => {
                            const lower = query.toLowerCase()
                            return get().memories.filter(
                                        (m) =>
                                                      m.title.toLowerCase().includes(lower) ||
                                                      m.content.toLowerCase().includes(lower) ||
                                                      m.tags.some((tag) => tag.toLowerCase().includes(lower))
                                      )
                  },

                  getRecentMemories: (limit = 10) =>
                            [...get().memories]
                      .sort(
                                    (a, b) =>
                                                    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
                                  )
                      .slice(0, limit),

                  getMemoriesByEntity: (entityId) =>
                            get().memories.filter((m) => m.entities.includes(entityId)),

                  getMemoriesByType: (type) =>
                            get().memories.filter((m) => m.type === type),

                  resetToFixtures: () => set(INITIAL_STATE),

                  clearAll: () => set({ memories: [] }),
          }),
      {
              name: 'sir-v2-memory',
      }
        )
  )
