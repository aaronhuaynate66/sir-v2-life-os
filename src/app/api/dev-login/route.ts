// TEMP dev-only login helper — mints a session for the mono-user and sets SSR cookies.
// Guarded to development. DELETE after use.
import { NextResponse } from 'next/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return new NextResponse('disabled', { status: 403 })
  }
  const { searchParams, origin } = new URL(request.url)
  const next = searchParams.get('next') ?? '/panel'
  const email = 'aaronhuaynate@gmail.com'

  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const gen = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (gen.error || !gen.data?.properties?.hashed_token) {
    return NextResponse.json({ step: 'generateLink', error: gen.error }, { status: 500 })
  }

  const supabase = await createClient() // server client, cookies mutable in Route Handler
  const ver = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: gen.data.properties.hashed_token,
  })
  if (ver.error) {
    return NextResponse.json({ step: 'verifyOtp', error: ver.error }, { status: 500 })
  }

  return NextResponse.redirect(`${origin}${next}`)
}
