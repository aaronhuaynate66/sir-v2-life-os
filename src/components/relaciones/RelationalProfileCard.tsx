'use client'

// SIR V2 — RelationalProfileCard (19·M1): perfil de cómo vincularte con la
// persona (apego/personalidad/valores/comunicación) como HIPÓTESIS, no
// diagnóstico. On-demand (llama a Sonnet, cache diaria server-side). Se genera
// con un botón para no gastar en cada visita.

import { useState } from 'react'
import { UserSearch, Loader2, Sparkles, RefreshCw } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { RelationalProfile, ProfileConfidence, AttachmentStyle } from '@/lib/profiling/relationalProfilePrompt'

const CONF_CLS: Record<ProfileConfidence, string> = { baja: 'text-muted-foreground', media: 'text-warn', alta: 'text-ok' }
const ATTACH_LABEL: Record<AttachmentStyle, string> = { seguro: 'Apego seguro', ansioso: 'Apego ansioso', evitativo: 'Apego evitativo', incierto: 'Apego incierto' }

export function RelationalProfileCard({ personId }: { personId: string; personName: string }) {
  const [profile, setProfile] = useState<RelationalProfile | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  async function generate(force = false) {
    setBusy(true); setError(null)
    try {
      const r = await fetch('/api/profiling/relational', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId, force }),
      })
      const j = (await r.json()) as { profile?: RelationalProfile; error?: string; detail?: string }
      if (!r.ok || !j.profile) { setError(j.error ? `${j.error}${j.detail ? ` — ${j.detail}` : ''}` : 'No pude armar el perfil.'); return }
      setProfile(j.profile); setLoaded(true)
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
          <div className="flex items-center gap-2">
            <UserSearch size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
            <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Cómo vincularte</h2>
          </div>
          {loaded && (
            <button type="button" onClick={() => void generate(true)} disabled={busy} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50">
              <RefreshCw size={11} className={cn(busy && 'animate-spin')} /> actualizar
            </button>
          )}
        </div>

        {!loaded && !busy && (
          <>
            <p className="text-[11px] text-muted-foreground mb-3 leading-snug">
              Un perfil de apego, personalidad y estilo — como <span className="font-medium text-foreground/80">hipótesis para vincularte mejor</span>, no un diagnóstico.
            </p>
            <Button size="sm" variant="outline" onClick={() => void generate(false)}>
              <Sparkles size={13} strokeWidth={1.75} className="mr-1.5" /> Generar perfil
            </Button>
          </>
        )}

        {busy && !profile && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2"><Loader2 size={14} className="animate-spin" /> Armando el perfil…</div>
        )}

        {error && <p className="text-[12px] text-bad mt-2">{error}</p>}

        {profile && (
          <div className="space-y-3 mt-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="text-[11px]">{ATTACH_LABEL[profile.attachment.style]}</Badge>
              <span className={cn('text-[11px] font-medium', CONF_CLS[profile.confidence])}>confianza {profile.confidence}</span>
            </div>
            {profile.attachment.note && <p className="text-[12px] text-muted-foreground leading-snug">{profile.attachment.note}</p>}

            {profile.personality.length > 0 && (
              <Row label="Personalidad">
                <div className="flex flex-wrap gap-1.5">{profile.personality.map((p, i) => <Badge key={i} variant="secondary" className="text-[11px] font-normal">{p}</Badge>)}</div>
              </Row>
            )}
            {profile.values.length > 0 && (
              <Row label="Qué valora">
                <div className="flex flex-wrap gap-1.5">{profile.values.map((v, i) => <Badge key={i} variant="outline" className="text-[11px] font-normal">{v}</Badge>)}</div>
              </Row>
            )}
            {profile.communication && <Row label="Comunicación / conflicto"><p className="text-[13px] text-foreground/90 leading-relaxed">{profile.communication}</p></Row>}
            {profile.energy && <Row label="Energía"><p className="text-[13px] text-foreground/90 leading-relaxed">{profile.energy}</p></Row>}

            {profile.howToRelate && (
              <div className="rounded-md border border-brand/30 bg-brand-soft p-3">
                <div className="text-[10px] uppercase tracking-[0.07em] text-brand-soft-foreground mb-1">Cómo vincularte mejor</div>
                <p className="text-sm text-foreground leading-relaxed">{profile.howToRelate}</p>
              </div>
            )}
            <p className="text-[10px] text-muted-foreground/70 leading-relaxed">{profile.note}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.06em] text-text-tertiary mb-1">{label}</div>
      {children}
    </div>
  )
}
