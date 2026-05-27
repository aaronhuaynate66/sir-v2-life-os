// SIR V2 — Supabase browser client (Sesión 20a, tipado en 20c)
// Para uso en componentes 'use client'.
// Auth flow (cookies) lo maneja @supabase/ssr internamente.

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
