// SIR V2 — Sync engine (Sesión 20c)
//
// Drives the bidirectional Zustand <-> Supabase sync. One engine instance
// per store. Lifecycle:
//
//  1. Mount: wait for persist hydration. Then subscribe to auth state.
//  2. On SIGNED_IN (and on attach if already signed in): pullAndMerge.
//  3. After first pull completes: subscribe to slice changes and push
//     diffs to Supabase via upsert/delete.
//  4. On state change (subscriber): O(n) referential-equality diff per
//     slice. Inserts+updates collapse to a single upsert call. Deletes
//     go through .delete().
//  5. On push fail: in-memory retry 1s / 4s / 16s. After 3 fails: log
//     + give up. The row remains in localStorage (persist middleware
//     already wrote it). It will be re-pushed on the next mutation of
//     the same row, because the subscriber will see another reference
//     change.
//
// Reentrancy guard: isApplyingPull = true while reconciling DB->local,
// so the subscriber early-returns and doesn't re-push.
//
// First-mount semantic (per Session 20c spec, Option A):
//   merged = local first, DB overrides on overlapping ids. Local-only
//   rows are NEVER deleted. DB-only rows are added. NO push of local
//   to DB (data migration is Session 20d).

'use client'

import type { StoreApi } from 'zustand'
import { createClient } from '@/lib/supabase/client'
import type { SliceBinding } from './types'

const RETRY_DELAYS_MS = [1000, 4000, 16000] as const

type PersistMeta = {
  persist?: {
    hasHydrated: () => boolean
    onFinishHydration: (cb: () => void) => () => void
  }
}

interface AttachedStore<S> {
  store: StoreApi<S> & PersistMeta
  // Each binding can carry its own item type; the engine treats them
  // through their slice<->row contract and never reasons over the item shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bindings: SliceBinding<S, any>[]
}

function logSyncError(label: string, op: string, err: unknown): void {
  console.error(`[sync:${label}] ${op} failed`, err)
}

async function pushWithRetry(
  fn: () => Promise<{ error: unknown }>,
  label: string,
  op: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length + 1; attempt++) {
    const result = await fn()
    if (!result.error) return true
    if (attempt < RETRY_DELAYS_MS.length) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]))
      continue
    }
    logSyncError(label, op, result.error)
  }
  return false
}

export function attachSupabaseSync<S>({ store, bindings }: AttachedStore<S>): () => void {
  if (typeof window === 'undefined') return () => undefined

  const supabase = createClient()
  let isApplyingPull = false
  let currentUserId: string | null = null
  let sliceUnsubs: Array<() => void> = []

  /**
   * Diff two arrays by id using referential equality. Returns inserts,
   * updates (changed via reference inequality) and deletes. O(n).
   */
  function diffSlice<T extends { id: string }>(
    prev: T[],
    curr: T[],
  ): { upserts: T[]; deletes: string[] } {
    const prevMap = new Map<string, T>()
    for (const item of prev) prevMap.set(item.id, item)
    const currMap = new Map<string, T>()
    for (const item of curr) currMap.set(item.id, item)

    const upserts: T[] = []
    for (const [id, curItem] of currMap) {
      const prevItem = prevMap.get(id)
      if (!prevItem || prevItem !== curItem) upserts.push(curItem)
    }
    const deletes: string[] = []
    for (const id of prevMap.keys()) {
      if (!currMap.has(id)) deletes.push(id)
    }
    return { upserts, deletes }
  }

  async function pullSlice<T extends { id: string }>(
    binding: SliceBinding<S, T>,
    userId: string,
  ): Promise<void> {
    const { data, error } = await supabase
      .from(binding.adapter.table)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select('*' as any)
      .eq('user_id', userId)
    if (error) {
      logSyncError(binding.label, 'pull', error)
      return
    }
    const dbItems = (data as Record<string, unknown>[]).map((row) => binding.adapter.fromRow(row))
    const localItems = binding.select(store.getState())
    const merged = new Map<string, T>()
    for (const r of localItems) merged.set(r.id, r)
    for (const r of dbItems) merged.set(r.id, r) // DB-wins on overlap
    const next = [...merged.values()]
    binding.apply(next)
  }

  async function pullAndMerge(userId: string): Promise<void> {
    isApplyingPull = true
    try {
      await Promise.all(bindings.map((b) => pullSlice(b, userId)))
    } finally {
      isApplyingPull = false
    }
  }

  function attachSubscribers(): void {
    for (const binding of bindings) {
      let prevSlice = binding.select(store.getState())
      const unsub = store.subscribe((state) => {
        if (isApplyingPull) return
        const userId = currentUserId
        if (!userId) {
          prevSlice = binding.select(state)
          return
        }
        const currSlice = binding.select(state)
        if (currSlice === prevSlice) return
        const { upserts, deletes } = diffSlice(prevSlice, currSlice)
        prevSlice = currSlice
        if (upserts.length === 0 && deletes.length === 0) return
        void flushOps(binding, upserts, deletes, userId)
      })
      sliceUnsubs.push(unsub)
    }
  }

  async function flushOps<T extends { id: string }>(
    binding: SliceBinding<S, T>,
    upserts: T[],
    deletes: string[],
    userId: string,
  ): Promise<void> {
    if (upserts.length > 0) {
      const rows = upserts.map((item) => binding.adapter.toRow(item, userId))
      await pushWithRetry(
        async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await supabase.from(binding.adapter.table).upsert(rows as any, { onConflict: 'id' })
          return { error }
        },
        binding.label,
        `upsert(${upserts.length})`,
      )
    }
    if (deletes.length > 0) {
      await pushWithRetry(
        async () => {
          const { error } = await supabase
            .from(binding.adapter.table)
            .delete()
            .in('id', deletes)
            .eq('user_id', userId)
          return { error }
        },
        binding.label,
        `delete(${deletes.length})`,
      )
    }
  }

  async function start(userId: string): Promise<void> {
    currentUserId = userId
    sliceUnsubs.forEach((u) => u())
    sliceUnsubs = []
    await pullAndMerge(userId)
    attachSubscribers()
  }

  function stop(): void {
    currentUserId = null
    sliceUnsubs.forEach((u) => u())
    sliceUnsubs = []
  }

  const persistApi = store.persist
  let hydrationUnsub: (() => void) | undefined
  let authUnsub: (() => void) | undefined

  function init(): void {
    void (async () => {
      const { data } = await supabase.auth.getUser()
      if (data.user) await start(data.user.id)
    })()

    const sub = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        void start(session.user.id)
      } else if (event === 'SIGNED_OUT') {
        stop()
      }
    })
    authUnsub = () => sub.data.subscription.unsubscribe()
  }

  if (persistApi) {
    if (persistApi.hasHydrated()) {
      init()
    } else {
      hydrationUnsub = persistApi.onFinishHydration(() => init())
    }
  } else {
    init()
  }

  return () => {
    hydrationUnsub?.()
    authUnsub?.()
    stop()
  }
}
