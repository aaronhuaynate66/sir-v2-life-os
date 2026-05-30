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
//   - fila local ausente de DB CON push pendiente (en pendingIds)
//                                         -> creada/editada offline, se conserva
//                                            (se re-pushea; no se pierde data).
//   - fila local ausente de DB SIN push pendiente
//                                         -> borrada remotamente O fantasma
//                                            adoptada por un pull viejo -> se DROPEA
//                                            (propaga deletes en vivo, no resucita).
// El drop ocurre bajo isApplyingPull -> el subscriber no pushea -> NO se emite
// DELETE a DB. Las filas reales en DB (ej. Diana) jamás se dropean.
// (Antes esto usaba "knownIds" — proxy negativo que no distinguía pendiente
//  real de fantasma adoptada, así que los deletes remotos no se aplicaban en
//  el receptor. pendingIds lo arregla y auto-sana fantasmas existentes.)

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

// ─── pendingIds: set persistido de ids con un PUSH LOCAL pendiente ───────
// (filas creadas/editadas localmente cuyo upsert aún NO se confirmó en DB).
// Es el ÚNICO motivo válido para conservar en un pull una fila local que no
// está en DB. Antes usábamos "knownIds" (negativo: conservar lo NO conocido),
// que no distinguía una fila genuinamente pendiente de una fila FANTASMA
// adoptada por pull en el pasado -> esas nunca se dropeaban ante un delete
// remoto. pendingIds es positivo y explícito: solo lo pendiente se conserva;
// todo lo demás ausente de DB se dropea (deletes remotos + fantasmas).
function pendingKey(table: string, userId: string): string {
  return `sync-pending:${table}:${userId}`
}

function loadPendingIds(table: string, userId: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(pendingKey(table, userId))
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === 'string')) : new Set()
  } catch {
    return new Set()
  }
}

function savePendingIds(table: string, userId: string, ids: Set<string>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(pendingKey(table, userId), JSON.stringify([...ids]))
  } catch {
    // localStorage lleno/deshabilitado: aceptable (peor caso, un push
    // pendiente no se preserva entre reloads; se re-pushea en la próxima
    // mutación o al reconectar).
  }
}

function mutatePendingIds(
  table: string,
  userId: string,
  fn: (s: Set<string>) => void,
): void {
  const s = loadPendingIds(table, userId)
  fn(s)
  savePendingIds(table, userId, s)
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
    const pending = loadPendingIds(binding.adapter.table, userId)

    // DB es autoritativo: arrancamos del set de DB.
    const next: T[] = [...dbItems]
    // Conservamos SOLO las filas locales ausentes de DB que tienen un PUSH
    // LOCAL pendiente (creadas/editadas offline, aún sin confirmar). Cualquier
    // otra fila local ausente de DB -> borrada remotamente O fantasma adoptada
    // por un pull viejo -> se DROPEA (propaga deletes en vivo, sin resucitar).
    for (const r of localItems) {
      if (!dbIds.has(r.id) && pending.has(r.id)) next.push(r)
    }

    if (syncDebug()) {
      const dropped = localItems.filter((r) => !dbIds.has(r.id) && !pending.has(r.id)).map((r) => r.id)
      dlog(
        `pull ${binding.adapter.table}: db=${dbItems.length} local=${localItems.length} pending=${pending.size}` +
          (dropped.length ? ` DROPPED=${dropped.length} ${JSON.stringify(dropped)}` : ''),
      )
    }

    // Prune: las filas pendientes que ya aparecen en DB están confirmadas
    // (por nuestro push o por sync); dejan de ser pendientes.
    if (pending.size > 0) {
      mutatePendingIds(binding.adapter.table, userId, (s) => {
        for (const id of dbIds) s.delete(id)
      })
    }

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
      // Marcamos pendiente ANTES de pushear: si el push falla (offline), la
      // fila se preserva en el próximo pull y se re-pushea al reconectar.
      mutatePendingIds(binding.adapter.table, userId, (s) => {
        for (const item of upserts) s.add(item.id)
      })
      const rows = upserts.map((item) => binding.adapter.toRow(item, userId))
      const ok = await pushWithRetry(
        async () => {
                  const { error } = await supabase.from(binding.adapter.table).upsert(rows as any, { onConflict: 'id' })
          return { error }
        },
        binding.label,
        `upsert(${upserts.length})`,
      )
      // Confirmado en DB -> deja de ser pendiente (queda como fila normal de
      // DB; un delete remoto posterior la reconcilia y dropea).
      if (ok) {
        mutatePendingIds(binding.adapter.table, userId, (s) => {
          for (const item of upserts) s.delete(item.id)
        })
      }
    }
    if (deletes.length > 0) {
      // Borrado local: ya no es pendiente, sin importar el resultado del push.
      mutatePendingIds(binding.adapter.table, userId, (s) => {
        for (const id of deletes) s.delete(id)
      })
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

  /**
   * Re-push de filas locales con push pendiente (creadas/editadas offline o
   * push fallido): las que están en pendingIds. Se llama al recuperar conexión.
   */
  async function repushPending(userId: string): Promise<void> {
    for (const binding of bindings) {
      const pendingSet = loadPendingIds(binding.adapter.table, userId)
      if (pendingSet.size === 0) continue
      const localItems = binding.select(store.getState())
      const toPush = localItems.filter((r) => pendingSet.has(r.id))
      if (toPush.length > 0) {
        await flushOps(binding, toPush, [], userId)
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
