'use client'

// SIR V2 — DataMigrationGate (Sesion 20d)
//
// Null-rendering client component. Single purpose: invoke
// useDataMigration() once per page mount. Mounted in root layout
// alongside <Toaster /> so it has access to toasts and runs on every
// authenticated client navigation entry.

import { useDataMigration } from '@/hooks/useDataMigration'

export function DataMigrationGate(): null {
  useDataMigration()
  return null
}
