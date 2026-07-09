'use client'
// SIR V2 — CareBanner: la señal de contacto del día, arriba del fold (7a).
//
// Sube la "ventana de contacto" (antes solo al pie) a un banner en el hero, con
// el encuadre de CUIDADO: si hay un tema abierto o días sensibles, "Con cuidado."
// + cómo entrar (escuchar, no cobrar respuesta). Si es buen momento, lo dice en
// positivo. Si no hay nada urgente (neutral), NO se muestra — no llena de ruido.
//
// Reusa useContactWindow (misma fuente que ContactWindowBadge, sin duplicar).

import { HeartHandshake, Sparkles } from 'lucide-react'

import type { Person } from '@/types'
import { useContactWindow } from './useContactWindow'

export function CareBanner({ person, phoneNumber, lastTone = null }: {
  person: Person
  phoneNumber?: string | null
  lastTone?: number | null
}) {
  const win = useContactWindow(person, lastTone)
  if (win.state === 'neutral') return null // nada urgente → sin banner

  const care = win.state === 'con_cuidado'
  const Icon = care ? HeartHandshake : Sparkles
  const wa = phoneNumber ? `https://wa.me/${phoneNumber.replace(/\D/g, '')}` : null

  return (
    <div
      className="mb-5 flex items-start gap-3 rounded-lg border px-4 py-3"
      style={{
        borderColor: care ? 'hsl(var(--warning) / .4)' : 'hsl(var(--success) / .4)',
        background: care ? 'hsl(var(--warning) / .07)' : 'hsl(var(--success) / .07)',
      }}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0" style={{ color: care ? 'hsl(var(--warning))' : 'hsl(var(--success))' }} />
      <div className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-foreground/90">
        <span className="font-semibold" style={{ color: care ? 'hsl(var(--warning))' : 'hsl(var(--success))' }}>
          {care ? 'Con cuidado.' : 'Buen momento.'}
        </span>{' '}
        {win.reason}. {win.tone}.
      </div>
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 self-center rounded-md border border-border bg-background px-2.5 py-1 text-[12px] font-medium text-foreground hover:border-border-strong transition-colors"
        >
          Abrir WhatsApp
        </a>
      )}
    </div>
  )
}
