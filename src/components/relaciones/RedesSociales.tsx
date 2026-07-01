'use client'
// SIR V2 — Redes & social (perfil social unificado, modelo personal-CRM).
//
// Fusión de las antiguas cards "Redes sociales" (#11, handles manuales) +
// "Vida social" (#7, datos extraídos de la captura de Instagram). Antes eran
// dos cards compitiendo por lo mismo; ahora los handles y el enriquecimiento
// de la captura viven en UN solo bloque coherente.
//
// - Handles manuales editables inline (persiste vía updatePerson -> sync,
//   mismo patrón que FechasImportantes). Campos canónicos en people
//   (migration 0010): phone_number / instagram_handle / linkedin_url /
//   twitter_handle.
// - Si hay captura de Instagram curada: se muestra enriquecido (handle,
//   verificado/privado, posts/seguidores/siguiendo, bio, link) DENTRO de la
//   misma card.
// - Sugerencias "detectado en captura · usar" si un handle está vacío pero
//   apareció en una captura.
//
// La captura/enriquecimiento se hace con el panel inline "Agregar captura"
// (AgregarCapturaPanel, arriba en el detalle) — NO se navega a /captura.

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  AtSign, Briefcase, Bird, Phone, ExternalLink, Edit2, Check, X as XIcon, Sparkles,
  BadgeCheck, Lock, Users,
} from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRelationshipStore } from '@/stores'
import {
  whatsappLink, instagramLink, twitterLink, normalizeUrl, normalizeHandle,
} from '@/lib/social/links'
import { latestOfType, readInstagram, readLinkedIn, fmtCount } from '@/lib/observations/profile'
import { RedesVariacion } from './RedesVariacion'
import { DiscardCaptureButton } from './DiscardCaptureButton'
import type { Observation, Confidence } from '@/lib/capture/observations/types'
import type { InstagramMutualFollowers } from '@/lib/capture/instagram/mutual'
import type { Person } from '@/types'

export interface RedesSocialesProps {
  person: Person
  observations: Observation[]
}

export function RedesSociales({ person, observations }: RedesSocialesProps) {
  const updatePerson = useRelationshipStore((s) => s.updatePerson)

  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [phone, setPhone] = useState(person.phoneNumber ?? '')
  const [instagram, setInstagram] = useState(person.instagramHandle ?? '')
  const [linkedin, setLinkedin] = useState(person.linkedinUrl ?? '')
  const [twitter, setTwitter] = useState(person.twitterHandle ?? '')

  // Handles detectados en capturas (sugerencias si el campo está vacío).
  const igObs = latestOfType(observations, 'instagram')
  const liObs = latestOfType(observations, 'linkedin')
  const igData = igObs ? readInstagram(igObs.data) : null
  const liData = liObs ? readLinkedIn(liObs.data) : null
  const scannedInstagram = igData?.handle ?? null
  // La narrativa social (síntesis del eje "Vida social") ahora vive en su propia
  // card (VidaSocial, #7) para ser consistente con Vida profesional / Lo personal.
  // Acá quedan SOLO los handles/links + el enriquecimiento de la captura.
  // URL de LinkedIn construida por el extractor desde el vanity visible (gema
  // V1). Si existe y la persona no tiene URL cargada, ofrecemos vincularla.
  const scannedLinkedinUrl = liData?.profileUrl ?? null

  function startEditing() {
    setPhone(person.phoneNumber ?? '')
    setInstagram(person.instagramHandle ?? '')
    setLinkedin(person.linkedinUrl ?? '')
    setTwitter(person.twitterHandle ?? '')
    setEditing(true)
  }

  function handleSave() {
    setSaving(true)
    try {
      updatePerson(person.id, {
        phoneNumber: phone.trim() || undefined,
        instagramHandle: normalizeHandle(instagram) ?? undefined,
        linkedinUrl: normalizeUrl(linkedin) ?? undefined,
        twitterHandle: normalizeHandle(twitter) ?? undefined,
        updatedAt: new Date().toISOString(),
      })
      toast.success('Redes actualizadas')
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  function useScannedInstagram() {
    if (!scannedInstagram) return
    updatePerson(person.id, {
      instagramHandle: normalizeHandle(scannedInstagram) ?? undefined,
      updatedAt: new Date().toISOString(),
    })
    toast.success('Instagram vinculado', { description: `@${scannedInstagram}` })
  }

  function useScannedLinkedin() {
    if (!scannedLinkedinUrl) return
    updatePerson(person.id, {
      linkedinUrl: normalizeUrl(scannedLinkedinUrl) ?? undefined,
      updatedAt: new Date().toISOString(),
    })
    toast.success('LinkedIn vinculado', { description: scannedLinkedinUrl.replace(/^https?:\/\//, '') })
  }

  const igUrl = instagramLink(person.instagramHandle)
  const liUrl = normalizeUrl(person.linkedinUrl ?? null)
  const twUrl = twitterLink(person.twitterHandle)
  const waUrl = whatsappLink(person.phoneNumber)
  const hasAny = igUrl || liUrl || twUrl || waUrl

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <AtSign size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
            <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
              Redes &amp; social
            </div>
          </div>
          {!editing && (
            <Button size="sm" variant="ghost" onClick={startEditing}>
              <Edit2 size={13} strokeWidth={1.75} className="mr-1" />
              Editar
            </Button>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            <Field id="rs-phone" label="Teléfono" Icon={Phone} value={phone} onChange={setPhone}
              placeholder="+51 999 888 777" disabled={saving} mono />
            <Field id="rs-ig" label="Instagram (handle)" Icon={AtSign} value={instagram} onChange={setInstagram}
              placeholder="diana.carolina.d" disabled={saving} mono />
            <Field id="rs-li" label="LinkedIn (URL)" Icon={Briefcase} value={linkedin} onChange={setLinkedin}
              placeholder="https://linkedin.com/in/…" disabled={saving} mono />
            <Field id="rs-tw" label="Twitter/X (handle)" Icon={Bird} value={twitter} onChange={setTwitter}
              placeholder="handle" disabled={saving} mono />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                <XIcon size={13} strokeWidth={1.75} className="mr-1" />
                Cancelar
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Check size={13} strokeWidth={1.75} className="mr-1" />
                {saving ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Nada manual ni capturado → empty state que apunta al panel inline. */}
            {!hasAny && !igObs && !liObs && (
              <p className="text-sm text-muted-foreground italic">
                Sin redes ni capturas. Usá <span className="not-italic font-medium">Editar</span>{' '}
                para vincular teléfono, Instagram, LinkedIn o Twitter — o subí una captura con{' '}
                <span className="not-italic font-medium">Agregar captura</span> (arriba) para enriquecer el perfil.
              </p>
            )}

            {/* Handles conectados (links externos). */}
            {hasAny && (
              <div className="space-y-2">
                {waUrl && <SocialRow Icon={Phone} label="WhatsApp" value={person.phoneNumber!} href={waUrl} accent="text-muted-foreground" />}
                {igUrl && <SocialRow Icon={AtSign} label="Instagram" value={`@${person.instagramHandle}`} href={igUrl} accent="text-muted-foreground" />}
                {liUrl && <SocialRow Icon={Briefcase} label="LinkedIn" value={liUrl.replace(/^https?:\/\//, '')} href={liUrl} accent="text-muted-foreground" />}
                {twUrl && <SocialRow Icon={Bird} label="Twitter/X" value={`@${person.twitterHandle}`} href={twUrl} accent="text-muted-foreground" />}
              </div>
            )}

            {/* Sugerencias detectadas en capturas (vincular sin re-tipear). */}
            {!person.instagramHandle && scannedInstagram && (
              <button
                type="button"
                onClick={useScannedInstagram}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border border-dashed border-border/60 rounded-md px-2.5 py-1.5 w-full"
              >
                <Sparkles size={12} strokeWidth={1.75} className="text-brand" aria-hidden="true" />
                Detectado en captura: <span className="font-mono text-foreground/80">@{scannedInstagram}</span>
                <span className="ml-auto underline underline-offset-2">usar</span>
              </button>
            )}
            {!person.linkedinUrl && scannedLinkedinUrl && (
              <button
                type="button"
                onClick={useScannedLinkedin}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border border-dashed border-border/60 rounded-md px-2.5 py-1.5 w-full"
              >
                <Sparkles size={12} strokeWidth={1.75} className="text-brand" aria-hidden="true" />
                Detectado en captura:{' '}
                <span className="font-mono text-foreground/80 truncate">{scannedLinkedinUrl.replace(/^https?:\/\//, '')}</span>
                <span className="ml-auto underline underline-offset-2 shrink-0">usar</span>
              </button>
            )}
            {!person.linkedinUrl && !scannedLinkedinUrl && liObs && (
              <p className="text-[11px] text-muted-foreground/70 flex items-center gap-1.5">
                <Sparkles size={11} strokeWidth={1.75} className="text-brand" aria-hidden="true" />
                Hay una captura de LinkedIn — pegá la URL del perfil en Editar para enlazarla.
              </p>
            )}

            {/* Enriquecimiento de la captura de Instagram (datos extraídos). */}
            {igObs && <InstagramEnrichment obs={igObs} />}

            {/* Variación de seguidores/seguidos/posts en el tiempo (historial de capturas). */}
            {igObs && <RedesVariacion personId={person.id} />}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Field({
  id, label, Icon, value, onChange, placeholder, disabled, mono,
}: {
  id: string
  label: string
  Icon: typeof AtSign
  value: string
  onChange: (v: string) => void
  placeholder?: string
  disabled?: boolean
  mono?: boolean
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs flex items-center gap-1.5">
        <Icon size={12} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={mono ? 'mt-1 font-mono' : 'mt-1'}
      />
    </div>
  )
}

function SocialRow({
  Icon, label, value, href, accent,
}: {
  Icon: typeof AtSign
  label: string
  value: string
  href: string
  accent: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-md border border-border/40 px-3 py-2 hover:border-accent/40 hover:bg-accent/5 transition-colors group"
    >
      <Icon size={15} strokeWidth={1.75} className={accent} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{label}</div>
        <div className="text-sm truncate">{value}</div>
      </div>
      <ExternalLink size={13} strokeWidth={1.75} className="text-muted-foreground/60 group-hover:text-foreground shrink-0" aria-hidden="true" />
    </a>
  )
}

/** Enriquecimiento desde la captura de Instagram (handle, badges, métricas,
 *  bio, link). Render determinístico de lo que el extractor estructuró — sin
 *  LLM. Vive DENTRO de la card unificada (antes era la card "Vida social"). */
function InstagramEnrichment({ obs }: { obs: Observation }) {
  const ig = readInstagram(obs.data)
  return (
    <div className="rounded-md border border-border/40 p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mr-1">
          Instagram · captura
        </span>
        {ig.handle && (
          (() => {
            const href = instagramLink(ig.handle)
            return href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium font-mono text-brand-soft-foreground hover:underline inline-flex items-center gap-1"
              >
                @{ig.handle}
                <ExternalLink size={11} strokeWidth={1.75} aria-hidden="true" />
              </a>
            ) : (
              <span className="text-sm font-medium font-mono text-foreground">@{ig.handle}</span>
            )
          })()
        )}
        {ig.isVerified && (
          <Badge variant="brand" className="text-[10px] font-normal gap-1">
            <BadgeCheck size={10} strokeWidth={2} aria-hidden="true" />
            verificado
          </Badge>
        )}
        {ig.isPrivate && (
          <Badge variant="outline" className="text-[10px] font-normal gap-1">
            <Lock size={10} strokeWidth={2} aria-hidden="true" />
            privado
          </Badge>
        )}
        {ig.category && (
          <Badge variant="outline" className="text-[10px] font-normal">
            {ig.category}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Posts" value={fmtCount(ig.postsCount)} />
        <Stat label="Seguidores" value={fmtCount(ig.followersCount)} />
        <Stat label="Siguiendo" value={fmtCount(ig.followingCount)} />
      </div>

      {ig.bio && (
        <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-border/40 pl-3 whitespace-pre-wrap line-clamp-4">
          {ig.bio}
        </p>
      )}

      {ig.externalLink && (
        <a
          href={ig.externalLink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-brand-soft-foreground hover:underline inline-flex items-center gap-1 break-all"
        >
          <ExternalLink size={11} strokeWidth={1.75} aria-hidden="true" />
          {ig.externalLink}
        </a>
      )}

      <div className="border-t border-border/40 pt-2 space-y-1.5">
        <MutualFollowers mutual={ig.mutualFollowers ?? null} confidence={obs.confidence} />
      </div>

      <div className="flex justify-end">
        <DiscardCaptureButton observationId={obs.id} what="Captura de Instagram" label="Descartar" />
      </div>
    </div>
  )
}

/** Seguidores en común extraídos de la captura. Si alguno de los handles
 *  nombrados coincide (por instagram_handle normalizado) con una persona que YA
 *  existe en la red del usuario, se enlaza a su ficha — sin crear personas ni
 *  inventar. Si no hay coincidencia pero el token parece un handle, se enlaza a
 *  Instagram; si es ambiguo, queda como texto plano. */
function MutualFollowers({
  mutual,
  confidence,
}: {
  mutual: InstagramMutualFollowers | null
  confidence: Confidence | null
}) {
  const people = useRelationshipStore((s) => s.people)
  const meta = (
    <span className="font-mono text-muted-foreground/50 text-[11px]">
      instagram · {confidence ?? 'sin confianza'}
    </span>
  )

  if (!mutual || (mutual.named.length === 0 && mutual.totalCount === null)) {
    return (
      <div className="text-[11px] text-muted-foreground/70 flex items-center justify-between gap-2">
        <span>Seguidores en común: datos insuficientes</span>
        {meta}
      </div>
    )
  }

  // Índice handle-normalizado -> persona (para enlazar lo que ya está en la red).
  const byHandle = new Map<string, Person>()
  for (const p of people) {
    const h = normalizeHandle(p.instagramHandle)
    if (h) byHandle.set(h.toLowerCase(), p)
  }

  const looksLikeHandle = (t: string) => /^[\w.]{1,40}$/.test(t)
  const extra =
    mutual.totalCount !== null && mutual.totalCount > mutual.named.length
      ? mutual.totalCount - mutual.named.length
      : 0

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground/70 flex items-center gap-1.5">
          <Users size={11} strokeWidth={1.75} aria-hidden="true" />
          Seguidores en común
          {mutual.totalCount !== null && (
            <span className="font-mono text-foreground/70 normal-case">{fmtCount(mutual.totalCount)}</span>
          )}
        </span>
        {meta}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {mutual.named.map((token) => {
          const norm = normalizeHandle(token)
          const match = norm ? byHandle.get(norm.toLowerCase()) : undefined
          if (match?.slug) {
            return (
              <Link
                key={token}
                href={`/relaciones/${match.slug}`}
                className="inline-flex items-center gap-1 rounded-full border border-brand/40 bg-brand/5 px-2 py-0.5 text-[11px] text-brand-soft-foreground hover:bg-brand/10 transition-colors"
                title={`${match.name} — en tu red`}
              >
                <Sparkles size={9} strokeWidth={2} aria-hidden="true" />
                {match.name}
              </Link>
            )
          }
          if (looksLikeHandle(token)) {
            const href = instagramLink(token)
            return href ? (
              <a
                key={token}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-border/50 px-2 py-0.5 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:border-accent/40 transition-colors"
              >
                @{token}
              </a>
            ) : (
              <span key={token} className="rounded-full border border-border/50 px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
                @{token}
              </span>
            )
          }
          return (
            <span key={token} className="rounded-full border border-border/50 px-2 py-0.5 text-[11px] text-muted-foreground">
              {token}
            </span>
          )
        })}
        {extra > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 text-[11px] text-muted-foreground/70">
            y {fmtCount(extra)} más
          </span>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/40 px-2 py-2 text-center">
      <div className="text-base font-semibold tabular-nums tracking-tight">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{label}</div>
    </div>
  )
}
