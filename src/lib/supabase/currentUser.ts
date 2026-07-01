// SIR V2 — currentUser (helper client-side)
//
// Memoiza la promesa de supabase.auth.getUser() a nivel MODULO para todos los
// consumidores browser (sync engines, hooks). Antes de esto, cada uno de los
// ~13 sync engines + hooks disparaba su propio getUser() al montar, generando
// un N+1 real medido en prod: 11-13 GET /auth/v1/user por navegacion (~1.5s
// de latencia extra solo verificando quien sos).
//
// El helper reusa la misma promesa hasta que resuelve; despues, cachea el
// resultado por AUTH_TTL_MS. onAuthStateChange invalida el cache para que
// SIGNED_OUT/SIGNED_IN se reflejen sin polling.
//
// server-only NO: este archivo es client-only por diseno (createBrowserClient).

'use client'

import type { User } from '@supabase/supabase-js'
import { createClient } from './client'

const AUTH_TTL_MS = 60_000

type CacheEntry = { user: User | null; fetchedAt: number }

let cache: CacheEntry | null = null
let inFlight: Promise<User | null> | null = null
let authSubscribed = false

function ensureAuthSubscription(): void {
  if (authSubscribed || typeof window === 'undefined') return
  authSubscribed = true
  const supabase = createClient()
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      cache = { user: null, fetchedAt: Date.now() }
    } else if (event === 'SIGNED_IN' && session?.user) {
      cache = { user: session.user, fetchedAt: Date.now() }
    } else if (event === 'TOKEN_REFRESHED' && session?.user) {
      cache = { user: session.user, fetchedAt: Date.now() }
    }
    inFlight = null
  })
}

/**
 * getCurrentUser — resuelve el user actual reusando la misma promesa cuando
 * hay una en vuelo, y cacheando el resultado por AUTH_TTL_MS. Los ~13 sync
 * engines lo llaman en paralelo al iniciar → una sola llamada real a Supabase.
 */
export async function getCurrentUser(): Promise<User | null> {
  ensureAuthSubscription()

  const now = Date.now()
  if (cache && now - cache.fetchedAt < AUTH_TTL_MS) {
    return cache.user
  }
  if (inFlight) return inFlight

  const supabase = createClient()
  inFlight = supabase.auth
    .getUser()
    .then(({ data, error }) => {
      const user = error ? null : data.user ?? null
      cache = { user, fetchedAt: Date.now() }
      return user
    })
    .catch(() => {
      cache = { user: null, fetchedAt: Date.now() }
      return null
    })
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

/** Solo para tests: resetea el cache y la subscripción tracking. */
export function __resetCurrentUserForTests(): void {
  cache = null
  inFlight = null
  authSubscribed = false
}
