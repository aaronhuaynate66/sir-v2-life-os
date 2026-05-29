'use client'
// SIR V2 — /captura/whatsapp
// Captura de conversaciones de WhatsApp via Claude Sonnet 4.5 Vision.
// Ruta protegida por el middleware (login requerido). AppShell + hydration gate.

import Link from 'next/link'
import { ArrowLeft, MessageSquare } from 'lucide-react'
import { AppShell } from '@/components/layout/AppShell'
import { WhatsAppCaptureFlow } from '@/components/capture/whatsapp/WhatsAppCaptureFlow'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { RouteSkeleton } from '@/components/skeletons/RouteSkeleton'

export default function CaptureWhatsAppPage() {
  const hydrated = useHasHydrated()
  if (!hydrated) return <RouteSkeleton cards={1} />
  return <CaptureWhatsAppContent />
}

function CaptureWhatsAppContent() {
  return (
    <AppShell>
      <Link
        href="/yo"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft size={13} strokeWidth={1.75} aria-hidden="true" />
        Volver a Self
      </Link>

      <header className="mb-6 sm:mb-8">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-sans mb-1">
          SIR V2 &mdash; Captura relacional
        </div>
        <div className="flex items-center gap-3">
          <MessageSquare
            size={20}
            strokeWidth={1.75}
            className="text-muted-foreground/70"
            aria-hidden="true"
          />
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Captura WhatsApp</h1>
        </div>
        <p className="text-xs sm:text-sm text-muted-foreground mt-2 max-w-2xl leading-relaxed">
          Subí un screenshot de una conversación. Claude Sonnet 4.5 identifica el
          contacto, infiere el tono emocional del intercambio, y guarda el resumen
          en el historial de esa persona — visible en <span className="font-medium text-foreground">/historial</span>.
        </p>
      </header>

      <WhatsAppCaptureFlow />
    </AppShell>
  )
}
