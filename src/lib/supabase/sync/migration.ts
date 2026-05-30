// SIR V2 — One-shot data migration (Sesión 20d)
//
// Migrates any localStorage rows that don't yet exist in Supabase up to
// the cloud. Runs once per user per device. Idempotent: re-running is
// safe (uses SELECT + ignoreDuplicates so already-synced rows are no-ops).
//
// Filters out fixture rows (the seeded sample data that lives in every
// fresh localStorage). Fixture IDs are derived live from the fixture
// constants — if someone adds a new fixture, it's filtered automatically.
//
// Never touches Zustand state. Reads stores via .getState() and writes
// directly to Supabase. The Session 20c sync engine observes only state
// mutations, so this migration doesn't trigger any re-push loops.

'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import { FIXTURE_IDS } from '@/data/fixtures/seed'
import { useMemoryStore } from '@/stores/useMemoryStore'
import { useSelfStore } from '@/stores/useSelfStore'
import { useFinanceStore } from '@/stores/useFinanceStore'
import { useSignalStore } from '@/stores/useSignalStore'
import { useGoalStore } from '@/stores/useGoalStore'
import { useRelationshipStore } from '@/stores/useRelationshipStore'
import type { Database } from '@/lib/supabase/types'
import {
  memoryAdapter, financeMovementAdapter, signalAdapter, goalAdapter,
  selfMetricAdapter, healthMetricAdapter, sleepRecordAdapter,
  personAdapter, relationshipAdapter,
} from '@/lib/supabase/sync'
import type { TableAdapter } from './types'

// IDs pre-sembrados (FIXTURE_IDS, fuente única en @/data/fixtures/seed).
// Nunca se pushean al DB. La lista es de strings literales, así este path
// (que corre en prod) no vuelve a importar los objetos fixture al bundle.

const RETRY_DELAY_MS = 2000

export interface TableMigrationResult {
  localCount: number
  fixturesSkipped: number
  alreadyInDb: number
  pushed: number
  failed: number
  skipped: boolean // true when nothing to push at all
  error?: string
}

export interface MigrationResult {
  startedAt: string
  finishedAt: string
  durationMs: number
  tables: Record<string, TableMigrationResult>
  totalLocal: number
  totalPushed: number
  totalFailed: number
  totalFixturesSkipped: number
  ok: boolean
  hadAnythingToPush: boolean
}

interface MigrationTask {
  label: string
  getItems: () => { id: string }[]
  // T is invariant in TableAdapter; the migration only uses .table and
  // .toRow at the boundary, so we widen to any here exactly the same
  // way the sync engine does for SliceBinding.
  // eslint-disable-next-line
  adapter: TableAdapter<any>
}

// Serial order: people BEFORE relationships (FK).
function buildTasks(): MigrationTask[] {
  return [
    {
      label: 'memories',
      getItems: () => useMemoryStore.getState().memories,
      adapter: memoryAdapter,
    },
    {
      label: 'self_metrics',
      getItems: () => useSelfStore.getState().selfMetrics,
      adapter: selfMetricAdapter,
    },
    {
      label: 'health_metrics',
      getItems: () => useSelfStore.getState().healthMetrics,
      adapter: healthMetricAdapter,
    },
    {
      label: 'sleep_records',
      getItems: () => useSelfStore.getState().sleepRecords,
      adapter: sleepRecordAdapter,
    },
    {
      label: 'finance_movements',
      getItems: () => useFinanceStore.getState().financialMovements,
      adapter: financeMovementAdapter,
    },
    {
      label: 'signals',
      getItems: () => useSignalStore.getState().signals,
      adapter: signalAdapter,
    },
    {
      label: 'goals',
      getItems: () => useGoalStore.getState().goals,
      adapter: goalAdapter,
    },
    {
      label: 'people',
      getItems: () => useRelationshipStore.getState().people,
      adapter: personAdapter,
    },
    {
      label: 'relationships',
      getItems: () => useRelationshipStore.getState().relationships,
      adapter: relationshipAdapter,
    },
  ]
}

function flagKey(userId: string): string {
  return `sir-v2-migrated-v1:${userId}`
}

export function isMigrated(userId: string): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(flagKey(userId)) === 'done'
  } catch {
    return false
  }
}

export function markMigrated(userId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(flagKey(userId), 'done')
  } catch {
    // localStorage full / disabled — accept partial idempotency. Migration
    // will re-run next mount but ignoreDuplicates keeps it safe.
  }
}

async function migrateTask(
  supabase: SupabaseClient<Database>,
  userId: string,
  task: MigrationTask,
): Promise<TableMigrationResult> {
  const allItems = task.getItems()
  if (allItems.length === 0) {
    return { localCount: 0, fixturesSkipped: 0, alreadyInDb: 0, pushed: 0, failed: 0, skipped: true }
  }

  const realItems = allItems.filter((i) => !FIXTURE_IDS.has(i.id))
  const fixturesSkipped = allItems.length - realItems.length
  if (realItems.length === 0) {
    return {
      localCount: allItems.length,
      fixturesSkipped,
      alreadyInDb: 0,
      pushed: 0,
      failed: 0,
      skipped: true,
    }
  }

  // Which of our real IDs are already in DB? Skip those.
  let alreadyInDb = 0
  const { data: existingRows, error: selectErr } = await supabase
    .from(task.adapter.table)
    .select('id')
    .eq('user_id', userId)
    .in('id', realItems.map((i) => i.id))

  if (selectErr) {
    // Fall through: if we can't pre-check, rely on ignoreDuplicates.
    console.warn(`[migration:20d] ${task.label} pre-check failed, falling back to ignoreDuplicates`, selectErr)
  } else if (existingRows) {
    const existingIds = new Set((existingRows as { id: string }[]).map((r) => r.id))
    alreadyInDb = existingIds.size
  }

  const existingIds = new Set(
    (existingRows as { id: string }[] | null)?.map((r) => r.id) ?? [],
  )
  const toInsert = realItems.filter((i) => !existingIds.has(i.id))

  if (toInsert.length === 0) {
    return {
      localCount: allItems.length,
      fixturesSkipped,
      alreadyInDb,
      pushed: 0,
      failed: 0,
      skipped: false,
    }
  }

  const rows = toInsert.map((item) => task.adapter.toRow(item, userId))

  let lastError: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await supabase
      .from(task.adapter.table)
      // Row shape is dynamic by table name; type-narrowing is impossible
      // here. The adapter's toRow has already produced the right shape.
      .upsert(rows as never[], { onConflict: 'id', ignoreDuplicates: true })
    if (!error) {
      return {
        localCount: allItems.length,
        fixturesSkipped,
        alreadyInDb,
        pushed: toInsert.length,
        failed: 0,
        skipped: false,
      }
    }
    lastError = error
    if (attempt === 0) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
  }

  return {
    localCount: allItems.length,
    fixturesSkipped,
    alreadyInDb,
    pushed: 0,
    failed: toInsert.length,
    skipped: false,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  }
}

export async function migrateAllStores(
  userId: string,
  supabase: SupabaseClient<Database>,
): Promise<MigrationResult> {
  const startedAt = new Date()
  const tables: Record<string, TableMigrationResult> = {}
  const tasks = buildTasks()

  let totalLocal = 0
  let totalPushed = 0
  let totalFailed = 0
  let totalFixturesSkipped = 0
  let hadAnythingToPush = false

  // Serial execution: keeps log output ordered and avoids any FK race
  // for people → relationships.
  for (const task of tasks) {
    const result = await migrateTask(supabase, userId, task)
    tables[task.label] = result
    totalLocal += result.localCount
    totalPushed += result.pushed
    totalFailed += result.failed
    totalFixturesSkipped += result.fixturesSkipped
    if (!result.skipped && (result.pushed > 0 || result.failed > 0)) {
      hadAnythingToPush = true
    }
  }

  const finishedAt = new Date()
  const ok = totalFailed === 0

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    tables,
    totalLocal,
    totalPushed,
    totalFailed,
    totalFixturesSkipped,
    ok,
    hadAnythingToPush,
  }
}

export function logMigrationResult(result: MigrationResult): void {
  /* eslint-disable no-console */
  console.groupCollapsed(
    `[migration:20d] ${result.ok ? 'ok' : 'partial'} in ${result.durationMs}ms — pushed=${result.totalPushed} failed=${result.totalFailed} fixturesSkipped=${result.totalFixturesSkipped}`,
  )
  for (const [label, t] of Object.entries(result.tables)) {
    if (t.skipped) {
      console.log(`  ${label.padEnd(20)} (skipped) localCount=${t.localCount} fixtures=${t.fixturesSkipped}`)
    } else {
      console.log(
        `  ${label.padEnd(20)} local=${t.localCount} fixtures=${t.fixturesSkipped} alreadyInDb=${t.alreadyInDb} pushed=${t.pushed} failed=${t.failed}${t.error ? ' err=' + t.error : ''}`,
      )
    }
  }
  console.groupEnd()
  /* eslint-enable no-console */
}
