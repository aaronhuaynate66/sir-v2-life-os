// SIR V2 — Supabase server client (Sesión 20a)
// Para uso en Server Components, Route Handlers y Server Actions.
// Lee/escribe cookies via next/headers para mantener la sesion sincronizada.

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // setAll desde un Server Component: silenciado.
            // El middleware (Sesion 20b) refresca la sesion via Route Handlers donde
            // las cookies si se pueden mutar.
          }
        },
      },
    },
  )
}
