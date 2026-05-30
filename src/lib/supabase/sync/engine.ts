// SIR V2 — Sync engine (Sesión 20c + sync en vivo cross-device)
//
// Drives the bidirectional Zustand <-> Supabase sync. One engine instance
// per store. Lifecycle:
//
//  1. Mount: wait for persist hydration. Then subscribe to auth state.
//  2. On SIGNED_IN (and on attach if already signed in): pull.
//  3. After first pull completes: subscribe to slice changes and push
//     diffs to Supabase via upsert/delete.
//  4. On state change (subscriber): O(n) referential-equality diff per
//     slice. Inserts+updates collapse to a single upsert call. Deletes
//     go through .delete().
//  5. On push fail: in-memory retry 1s / 4s / 16s. After 3 fails: log
//     + give up. The row remains in localStorage. Se re-pushea en la próxima
//     mutación de esa fila O al reconectar (evento 'online' -> repushPending).
//
// SYNC EN VIVO (cross-device): además del pull inicial, re-pulleamos cuando
//   - la pestaña recupera foco/visibilidad (visibilitychange/focus),
//   - llega un evento Realtime de Supabase para una tabla del store,
//   - se recupera la conexión ('online') — ahí además re-pusheamos pendientes.
//
// Reentrancy guard: isApplyingPull = true mientras reconciliamos DB->local.
// El subscriber, bajo isApplyingPull, ACTUALIZA prevSlice a la slice aplicada
// y retorna SIN pushear. Esto es lo que hace seguros los re-pulls repetidos:
// sin esto, prevSlice quedaría stale y la próxima mutación genuina re-emitiría
// los cambios del pull hacia DB (eco). NO hay loop de realtime: un evento solo
// dispara un re-pull (idempotente, DB-autoritativo), nunca un push.
//
// Reconciliation semantic (Supabase como única fuente de verdad):
//   - fila en DB                          -> autoritativa, se conserva.
//   - fila local ausente de DB pero NUNCA sincronizada (no en knownIds)
//                                         -> creada offline/pendiente, se conserva.
//   - fila local ausente de DB que SÍ estuvo sincronizada (en knownIds)
//                                         -> borrada remotamente, se DROPEA
//                                            (propaga deletes, no resucita).
// El drop ocurre bajo isApplyingPull -> el subscriber no pushea -> NO se emite
// DELETE a DB. Las filas reales en DB (ej. Diana) jamás se dropean.

'use client'

import type { StoreApi } from 'zustand'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { SliceBinding } from './types'

const RETRY_DELAYS_MS = [1000, 4000, 16000] as const
// Throttle de re-pull por foco/visibilidad: evita martillar en toggles rápidos.
const FOCUS_PULL_THROTTLE_MS = 2000
// Debounce de re-pull por Realtime: coalesce ráfagas de eventos.
const REALTIME_PULL_DEBOUNCE_MS = 600

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

// Logging de diagnóstico de Realtime/sync, OFF por defecto. Activar en la
// consola del navegador: localStorage.setItem('sir-debug-sync','1') y recargar.
// Distingue "el evento DELETE no llega" vs "llega pero el re-pull no dropea".
function syncDebug(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem('sir-debug-sync') === '1'
  } catch {
    return false
  }
}
function dlog(...args: unknown[]): void {
  if (syncDebug()) console.debug('[sync]', ...args)
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
  let pullInFlight = false
  let lastPullAt = 0
  let currentUserId: string | null = null
  let sliceUnsubs: Array<() => void> = []
  let realtimeChannel: RealtimeChannel | null = null
  let realtimeTimer: ReturnType<typeof setTimeout> | null = null

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

    if (syncDebug()) {
      const dropped = localItems.filter((r) => !dbIds.has(r.id) && known.has(r.id)).map((r) => r.id)
      dlog(
        `pull ${binding.adapter.table}: db=${dbItems.length} local=${localItems.length}` +
          (dropped.length ? ` DROPPED=${dropped.length} ${JSON.stringify(dropped)}` : ''),
      )
    }

    // knownIds = exactamente lo que hay en DB ahora. (Las pendientes locales
    // entran a known recién cuando su upsert se confirma en flushOps.)
    saveKnownIds(binding.adapter.table, userId, dbIds)

    binding.apply(next)
  }

  /**
   * Pull de todas las slices, guarded. isApplyingPull evita que el subscriber
   * pushee; pullInFlight evita pulls solapados (foco + realtime concurrentes).
   * Idempotente y DB-autoritativo: seguro de llamar repetidamente.
   */
  async function runPull(userId: string): Promise<void> {
    if (pullInFlight) return
    pullInFlight = true
    isApplyingPull = true
    lastPullAt = Date.now()
    try {
      await Promise.all(bindings.map((b) => pullSlice(b, userId)))
    } finally {
      isApplyingPull = false
      pullInFlight = false
    }
  }

  function attachSubscribers(): void {
    for (const binding of bindings) {
      let prevSlice = binding.select(store.getState())
      const unsub = store.subscribe((state) => {
        const currSlice = binding.select(state)
        // Bajo pull/realtime: trackeamos la slice aplicada como nuevo baseline
        // y NO pusheamos (la data ya viene de DB). Critico para re-pulls: sin
        // esto prevSlice quedaria stale y re-emitiriamos lo pulleado.
        if (isApplyingPull) {
          prevSlice = currSlice
          return
        }
        const userId = currentUserId
        if (!userId) {
          prevSlice = currSlice
          return
        }
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

  /**
   * Re-push de filas locales pendientes (creadas offline / push fallido):
   * son las que NO están en knownIds. Se llama al recuperar conexión.
   */
  async function repushPending(userId: string): Promise<void> {
    for (const binding of bindings) {
      const known = loadKnownIds(binding.adapter.table, userId)
      const localItems = binding.select(store.getState())
      const pending = localItems.filter((r) => !known.has(r.id))
      if (pending.length > 0) {
        await flushOps(binding, pending, [], userId)
      }
    }
  }

  // ─── Triggers de sync en vivo ──────────────────────────────────────
  function maybePullOnFocus(): void {
    const uid = currentUserId
    if (!uid) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    if (Date.now() - lastPullAt < FOCUS_PULL_THROTTLE_MS) return
    void runPull(uid)
  }

  function onOnline(): void {
    const uid = currentUserId
    if (!uid) return
    void repushPending(uid).then(() => runPull(uid))
  }

  function scheduleRealtimePull(): void {
    const uid = currentUserId
    if (!uid) return
    if (realtimeTimer) clearTimeout(realtimeTimer)
    realtimeTimer = setTimeout(() => {
      realtimeTimer = null
      void runPull(uid)
    }, REALTIME_PULL_DEBOUNCE_MS)
  }

  function subscribeRealtime(userId: string): void {
    unsubscribeRealtime()
    const tables = [...new Set(bindings.map((b) => b.adapter.table))].sort()
    if (tables.length === 0) return
    // Nombre único por engine (por conjunto de tablas) para no colisionar
    // entre stores. El user_id va en el nombre para aislar sesiones.
    let channel = supabase.channel(`sync:${userId}:${tables.join(',')}`)
    for (const table of tables) {
      // event '*' (insert/update/delete). NO filtramos por user_id: el evento
      // solo dispara un re-pull RLS-scoped; así los DELETE remotos (que no
      // cargan user_id sin REPLICA IDENTITY FULL) igual disparan reconciliación.
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload) => {
          dlog(`realtime event ${table} ${payload.eventType}`, payload)
          scheduleRealtimePull()
        },
      )
    }
    channel.subscribe((status) => dlog(`realtime channel status: ${status}`))
    realtimeChannel = channel
  }

  function unsubscribeRealtime(): void {
    if (realtimeTimer) {
      clearTimeout(realtimeTimer)
      realtimeTimer = null
    }
    if (realtimeChannel) {
      void supabase.removeChannel(realtimeChannel)
      realtimeChannel = null
    }
  }

  async function start(userId: string): Promise<void> {
    currentUserId = userId
    sliceUnsubs.forEach((u) => u())
    sliceUnsubs = []
    await runPull(userId)
    attachSubscribers()
    subscribeRealtime(userId)
  }

  function stop(): void {
    currentUserId = null
    sliceUnsubs.forEach((u) => u())
    sliceUnsubs = []
    unsubscribeRealtime()
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

    // Triggers de sync en vivo (registrados una vez; chequean currentUserId).
    document.addEventListener('visibilitychange', maybePullOnFocus)
    window.addEventListener('focus', maybePullOnFocus)
    window.addEventListener('online', onOnline)
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
    document.removeEventListener('visibilitychange', maybePullOnFocus)
    window.removeEventListener('focus', maybePullOnFocus)
    window.removeEventListener('online', onOnline)
    stop()
  }
}
