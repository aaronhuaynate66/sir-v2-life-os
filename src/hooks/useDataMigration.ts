'use client'

// SIR V2 — useDataMigration (Sesion 20d)
//
// Orchestrates the one-shot localStorage -> Supabase migration. Runs once
// per (userId, device). Steps:
//   1. Wait for store hydration (useHasHydrated).
//   2. Read current Supabase user.
//   3. If migrated flag is set OR no user → no-op.
//   4. Otherwise run migrateAllStores in background. Toast result. Mark
//      flag only on 100% success.
//
// Does NOT block render. Hook returns void; callers just invoke it once
// from a client component near the root.

import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import {
  isMigrated, markMigrated, migrateAllStores, logMigrationResult,
} from '@/lib/supabase/sync/migration'
import { useHasHydrated } from './useHasHydrated'

export function useDataMigration(): void {
  const hydrated = useHasHydrated()
  const ranRef = useRef(false)

  useEffect(() => {
    if (!hydrated) return
    if (ranRef.current) return
    ranRef.current = true

    let cancelled = false
    const supabase = createClient()

    void (async () => {
      const { data, error } = await supabase.auth.getUser()
      if (cancelled) return
      if (error || !data.user) return // No user → skip silently.

      const userId = data.user.id
      if (isMigrated(userId)) return // Already done on this device.

      const result = await migrateAllStores(userId, supabase)
      if (cancelled) return

      logMigrationResult(result)

      if (result.ok) markMigrated(userId)

      // Toast policy: silent when nothing was actually pushed.
      if (!result.hadAnythingToPush) return

      if (result.ok) {
        toast.success('Datos sincronizados', {
          description: 'Tu historial esta disponible en todos tus dispositivos.',
          duration: 5000,
        })
      } else if (result.totalPushed > 0) {
        toast.warning('Sincronizacion parcial', {
          description: `${result.totalPushed} registros sincronizados, ${result.totalFailed} se reintentaran en la proxima sesion.`,
          duration: 7000,
        })
      } else {
        toast.error('No se pudo sincronizar', {
          description: 'Tus datos siguen seguros localmente. Reintentaremos.',
          duration: 7000,
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [hydrated])
}
