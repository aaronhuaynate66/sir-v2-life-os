'use client'
// SIR V2 — Login page (Sesión 20b)
// Google OAuth primary + Magic Link fallback.

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Mail, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

function LoginForm() {
  const searchParams = useSearchParams()
  const errorParam = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [loadingProvider, setLoadingProvider] = useState<'google' | 'email' | null>(null)
  const [magicSent, setMagicSent] = useState(false)
  const [error, setError] = useState<string | null>(
    errorParam === 'auth_callback_failed' ? 'No se pudo completar el inicio de sesión. Intenta de nuevo.' : null,
  )

  async function handleGoogle() {
    setError(null)
    setLoadingProvider('google')
    const supabase = createClient()
    // Sin query params en redirectTo: Supabase valida la URL completa contra la
    // allowlist y los wildcards (*-kenas-...) solo matchean paths desnudos.
    // El callback siempre redirige a /dashboard por default (basta para single-user).
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (oauthError) {
      setError(oauthError.message)
      setLoadingProvider(null)
    }
    // si no hubo error, el browser navega a Google y no volvemos aqui.
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setError(null)
    setLoadingProvider('email')
    const supabase = createClient()
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    setLoadingProvider(null)
    if (otpError) {
      setError(otpError.message)
      return
    }
    setMagicSent(true)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mb-1">SIR V2</div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Iniciar sesion</h1>
          <p className="text-sm text-muted-foreground mt-2">Tu Life Operating System personal.</p>
        </div>

        <Card className="shadow-none">
          <CardContent className="p-6 space-y-4">
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
                <AlertCircle size={14} strokeWidth={1.75} className="text-red-400 mt-0.5 flex-shrink-0" />
                <span className="text-xs text-red-400 leading-relaxed">{error}</span>
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={handleGoogle}
              disabled={loadingProvider !== null}
              className="w-full justify-center gap-2"
            >
              <GoogleIcon />
              {loadingProvider === 'google' ? 'Redirigiendo…' : 'Continuar con Google'}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-card px-2 text-[10px] uppercase tracking-widest text-muted-foreground/60">o magic link</span>
              </div>
            </div>

            {magicSent ? (
              <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-3">
                <CheckCircle2 size={14} strokeWidth={1.75} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-emerald-400 leading-relaxed">
                  Revisa <span className="font-mono">{email}</span> y haz click en el link para entrar.
                </div>
              </div>
            ) : (
              <form onSubmit={handleMagicLink} className="space-y-2">
                <div className="relative">
                  <Mail size={14} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
                  <Input
                    type="email"
                    required
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loadingProvider !== null}
                    className="pl-9"
                    autoComplete="email"
                  />
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  disabled={loadingProvider !== null || !email.trim()}
                  className="w-full justify-center gap-2"
                >
                  {loadingProvider === 'email' ? 'Enviando…' : 'Enviar magic link'}
                  <ArrowRight size={14} strokeWidth={1.75} />
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-[10px] uppercase tracking-widest text-muted-foreground/40 font-mono text-center mt-8">
          datos &rarr; paz
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  // useSearchParams requiere Suspense en App Router.
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <LoginForm />
    </Suspense>
  )
}
