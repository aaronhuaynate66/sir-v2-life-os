'use client'
// SIR V2 — PersonActions (botones de cabecera del detail page).
//
// Chat WhatsApp: link directo a wa.me/{telefono} (nueva pestaña). Solo
// habilitado si la persona tiene phoneNumber; si no, queda disabled con hint a
// vincularlo en "Redes sociales".
//
// El "Ponme al día" (briefing IA) se movió al Asistente SIR de la ficha
// (PreguntarSobrePersona) para tener UN solo punto de IA conversacional, no dos.

import { MessageCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { whatsappLink } from '@/lib/social/links'

export interface PersonActionsProps {
  personId: string
  personName: string
  phoneNumber?: string | null
}

export function PersonActions({ phoneNumber }: PersonActionsProps) {
  const waUrl = whatsappLink(phoneNumber)

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {waUrl ? (
        <Button
          size="sm"
          variant="outline"
          asChild
          className="border-ok/30 bg-ok-soft text-ok hover:bg-ok/20 hover:text-ok"
        >
          <a href={waUrl} target="_blank" rel="noopener noreferrer">
            <MessageCircle size={14} strokeWidth={1.75} className="mr-1.5" />
            Chat WhatsApp
          </a>
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled
          title="Agrega un teléfono en Redes sociales para habilitar el chat."
        >
          <MessageCircle size={14} strokeWidth={1.75} className="mr-1.5" />
          Chat WhatsApp
        </Button>
      )}
    </div>
  )
}
