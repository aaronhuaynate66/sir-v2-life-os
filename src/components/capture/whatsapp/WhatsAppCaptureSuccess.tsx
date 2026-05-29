'use client'
// SIR V2 — Step 4: confirmacion final con 3 CTAs.

import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface WhatsAppCaptureSuccessProps {
  personName: string
  /** Slug del person para deep-link al detail page. Si no hay slug, ocultar el CTA. */
  personSlug?: string
  topicsCount: number
  messagesCount: number
  confidence: 'high' | 'medium' | 'low'
  onAnother: () => void
}

export function WhatsAppCaptureSuccess({
  personName,
  personSlug,
  topicsCount,
  messagesCount,
  confidence,
  onAnother,
}: WhatsAppCaptureSuccessProps) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-6 sm:p-8 flex flex-col items-center text-center gap-4">
        <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
          <CheckCircle2 size={28} strokeWidth={1.75} className="text-emerald-400" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">
            Captura guardada en el historial de <span className="text-primary">{personName}</span>
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {topicsCount} {topicsCount === 1 ? 'tema' : 'temas'} · {messagesCount} {messagesCount === 1 ? 'mensaje' : 'mensajes'} · conf. {confidence}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-center pt-2">
          <Button size="sm" variant="outline" onClick={onAnother}>
            Otra captura
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/historial">Ver en historial</Link>
          </Button>
          {personSlug && (
            <Button size="sm" asChild>
              <Link href={`/relaciones/${personSlug}`}>Ver perfil de {personName}</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
