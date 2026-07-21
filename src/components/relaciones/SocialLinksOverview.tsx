'use client'

// SIR V2 — Vista general de ENLACES SOCIALES de la red: quién tiene IG/LinkedIn
// enlazado y a quién de tu círculo le falta. Responde "¿dónde veo/gestiono el
// matcheo?". Los handles se editan en la ficha de cada persona (Redes sociales);
// acá ves el panorama y saltas a los que faltan. WhatsApp matchea por nombre solo.

import Link from 'next/link'
import { Share2, AtSign, Briefcase, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useRelationshipStore } from '@/stores/useRelationshipStore'

export function SocialLinksOverview() {
  const people = useRelationshipStore((s) => s.people)
  if (people.length === 0) return null

  const total = people.length
  const withIG = people.filter((p) => p.instagramHandle).length
  const withLI = people.filter((p) => p.linkedinUrl).length

  // Tu círculo cercano SIN Instagram enlazado — los que más valen la pena conectar
  // (para que el reader capte su actividad). Cap a 12, orden alfabético.
  const closeNoIG = people
    .filter((p) => (p.category === 'inner_circle' || p.category === 'close') && !p.instagramHandle)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 12)

  return (
    <Card className="shadow-none">
      <CardContent className="p-4 sm:p-6">
        <div className="mb-1 flex items-center gap-2">
          <Share2 size={16} className="text-brand" />
          <h3 className="text-sm font-semibold">Enlaces sociales de tu red</h3>
        </div>
        <p className="mb-3 text-xs text-muted-foreground leading-relaxed">
          Para que SIR capte la actividad de alguien, ese contacto necesita su Instagram (o LinkedIn) enlazado. Se edita en la <span className="font-medium">ficha de cada persona → Redes sociales</span>. WhatsApp se enlaza solo, por nombre.
        </p>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="rounded-lg border border-border bg-muted/30 p-2.5">
            <div className="flex items-center gap-1.5 text-sm font-semibold"><AtSign size={14} className="text-brand" /> {withIG}<span className="text-muted-foreground/60 font-normal">/{total}</span></div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mt-0.5">con Instagram</div>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-2.5">
            <div className="flex items-center gap-1.5 text-sm font-semibold"><Briefcase size={14} className="text-brand" /> {withLI}<span className="text-muted-foreground/60 font-normal">/{total}</span></div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mt-0.5">con LinkedIn</div>
          </div>
        </div>

        {closeNoIG.length > 0 && (
          <div className="border-t border-border/40 pt-2.5">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground/70 mb-1.5">Tu círculo cercano sin Instagram — enlázalos</div>
            <div className="space-y-0.5">
              {closeNoIG.map((p) => (
                <Link
                  key={p.id}
                  href={`/relaciones/${p.slug ?? p.id}`}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 -mx-2 hover:bg-accent/10 transition-colors text-sm"
                >
                  <span className="truncate">{p.name}</span>
                  <ChevronRight size={14} className="shrink-0 text-muted-foreground/50" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
