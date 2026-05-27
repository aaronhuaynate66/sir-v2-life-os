// SIR V2 — Sync layer types (Sesión 20c)
// Defines the contract between a Zustand store and a Supabase table.

import type { TableName } from '@/lib/supabase/types'

export interface TableAdapter<T extends { id: string }> {
  /** Exact table name in `public` schema. */
  table: TableName
  /** Maps a domain entity → DB row for INSERT/UPSERT. user_id injected here. */
  toRow: (item: T, userId: string) => Record<string, unknown>
  /** Maps a DB row → domain entity for state hydration. */
  fromRow: (row: Record<string, unknown>) => T
}

export interface SliceBinding<S, T extends { id: string }> {
  /** Stable label used for logging/debugging. */
  label: string
  /** Reads the array slice from store state. */
  select: (s: S) => T[]
  /**
   * Writes the array slice back. The implementation MUST go through
   * the sync engine's pull-apply path (which sets isApplyingPull) so
   * the subscriber doesn't re-push the pulled data.
   */
  apply: (items: T[]) => void
  adapter: TableAdapter<T>
}

export interface SyncOptions<S> {
  /** All slice bindings driven by this store. */
  bindings: SliceBinding<S, { id: string }>[]
}
