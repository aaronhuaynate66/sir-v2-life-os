// SIR V2 — Supabase browser client (Sesión 20a)
// Para uso en componentes 'use client'.
// Auth flow (cookies) lo maneja @supabase/ssr internamente.

import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
