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
// Reconciliation semantic (Supabase como única fuente de verdad — refactor
// split-brain). El pull ya NO es aditivo ciego. Distinguimos:
//   - fila en DB                          -> autoritativa, se conserva.
//   - fila local ausente de DB pero NUNCA sincronizada (no en knownIds)
//                                         -> creada offline/pendiente, se
//                                            conserva (se pushea luego).
//   - fila local ausente de DB que SÍ estuvo sincronizada (en knownIds)
//                                         -> borrada remotamente, se DROPEA
//                                            (asi se propagan los deletes y
//                                             no resucitan filas borradas).
// knownIds se persiste por (tabla,user) en localStorage para sobrevivir
// reloads (clave para el caso "device B" del split-brain). El drop ocurre
// bajo isApplyingPull -> el subscriber no lo ve -> NO se emite DELETE a DB
// (la fila ya no está allá). Las filas reales en DB (ej. Diana) jamás se
// dropean porque están en DB.

'use client'

import type { StoreApi } from 'zustand'
import { createClient } from '@/lib/supabase/client'
import type { SliceBinding } from './types'

const RETRY_DELAYS_MS = [1000, 4000, 16000] as const

// ─── knownIds: set persistido de ids confirmados en DB por (tabla,user) ──
function knownKey(table: string, userId: string): string {
  return `sync-known:${table}:${userId}`
}

function loadKnownIds(table: string, userId: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(knownKey(table, userId))
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

function saveKnownIds(table: string, userId: string, ids: Set<string>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(knownKey(table, userId), JSON.stringify([...ids]))
  } catch {
    // localStorage lleno/deshabilitado: degradamos a merge aditivo en el
    // proximo pull (knownIds vacio = conservar local-only). Aceptable.
  }
}

function mutateKnownIds(
  table: string,
  userId: string,
  fn: (s: Set<string>) => void,
): void {
  const s = loadKnownIds(table, userId)
  fn(s)
  saveKnownIds(table, userId, s)
}

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
          .select('*' as any)
      .eq('user_id', userId)
    if (error) {
      logSyncError(binding.label, 'pull', error)
      return
    }
    const dbItems = (data as Record<string, unknown>[]).map((row) => binding.adapter.fromRow(row))
    const dbIds = new Set(dbItems.map((r) => r.id))
    const localItems = binding.select(store.getState())
    const known = loadKnownIds(binding.adapter.table, userId)

    // DB es autoritativo: arrancamos del set de DB.
    const next: T[] = [...dbItems]
    // Conservamos SOLO las filas locales ausentes de DB que nunca se
    // sincronizaron (creadas offline / push pendiente). Las que sí estuvieron
    // sincronizadas y ya no están en DB se consideran borradas remotamente
    // y se dropean (propaga el delete, evita resurrección).
    for (const r of localItems) {
      if (!dbIds.has(r.id) && !known.has(r.id)) next.push(r)
    }

    // knownIds = exactamente lo que hay en DB ahora. (Las pendientes locales
    // entran a known recién cuando su upsert se confirma en flushOps.)
    saveKnownIds(binding.adapter.table, userId, dbIds)

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
      const ok = await pushWithRetry(
        async () => {
                  const { error } = await supabase.from(binding.adapter.table).upsert(rows as any, { onConflict: 'id' })
          return { error }
        },
        binding.label,
        `upsert(${upserts.length})`,
      )
      // Confirmado en DB -> entran a knownIds (deja de tratarse como
      // pendiente local; si luego desaparece de DB, se reconcilia como delete).
      if (ok) {
        mutateKnownIds(binding.adapter.table, userId, (s) => {
          for (const item of upserts) s.add(item.id)
        })
      }
    }
    if (deletes.length > 0) {
      const ok = await pushWithRetry(
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
      // Borrado del DB -> salen de knownIds.
      if (ok) {
        mutateKnownIds(binding.adapter.table, userId, (s) => {
          for (const id of deletes) s.delete(id)
        })
      }
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
