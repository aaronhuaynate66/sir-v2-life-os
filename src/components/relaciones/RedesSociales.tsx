'use client'
// SIR V2 — RedesSociales (#11 del detail page V1).
//
// Redes/contacto conectados de la persona, con enlaces externos. Editable
// inline (persiste vía updatePerson -> sync engine, mismo patrón que
// FechasImportantes). Campos canónicos en people (migration 0010):
// phone_number / instagram_handle / linkedin_url / twitter_handle.
//
// Bonus: si un handle no está seteado pero SÍ aparece en una captura
// (observation instagram/linkedin curada), lo ofrecemos como sugerencia
// "detectado en captura · usar" — el escaneo del V1, sin re-tipear.

import { useState } from 'react'
import { toast } from 'sonner'
import {
  AtSign, Briefcase, Bird, Phone, ExternalLink, Edit2, Check, X as XIcon, Sparkles,
} from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRelationshipStore } from '@/stores'
import {
  whatsappLink, instagramLink, twitterLink, normalizeUrl, normalizeHandle,
} from '@/lib/social/links'
import { latestOfType, readInstagram, readLinkedIn } from '@/lib/observations/profile'
import type { Observation } from '@/lib/capture/observations/types'
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
  const scannedInstagram = igObs ? readInstagram(igObs.data).handle ?? null : null
  const scannedLinkedinHasProfile = !!liObs // linkedin_url no se extrae como tal; señalamos que hay captura

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
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
              Redes sociales
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
          <div className="space-y-2">
            {!hasAny && (
              <p className="text-sm text-muted-foreground italic">
                Sin redes conectadas. Usá <span className="not-italic font-medium">Editar</span>{' '}
                para vincular teléfono, Instagram, LinkedIn o Twitter.
              </p>
            )}
            {waUrl && <SocialRow Icon={Phone} label="WhatsApp" value={person.phoneNumber!} href={waUrl} accent="text-emerald-400" />}
            {igUrl && <SocialRow Icon={AtSign} label="Instagram" value={`@${person.instagramHandle}`} href={igUrl} accent="text-pink-400" />}
            {liUrl && <SocialRow Icon={Briefcase} label="LinkedIn" value={liUrl.replace(/^https?:\/\//, '')} href={liUrl} accent="text-sky-400" />}
            {twUrl && <SocialRow Icon={Bird} label="Twitter/X" value={`@${person.twitterHandle}`} href={twUrl} accent="text-foreground" />}

            {/* Sugerencias detectadas en capturas */}
            {!person.instagramHandle && scannedInstagram && (
              <button
                type="button"
                onClick={useScannedInstagram}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors border border-dashed border-border/60 rounded-md px-2.5 py-1.5 w-full"
              >
                <Sparkles size={12} strokeWidth={1.75} className="text-pink-400" aria-hidden="true" />
                Detectado en captura: <span className="font-mono text-foreground/80">@{scannedInstagram}</span>
                <span className="ml-auto underline underline-offset-2">usar</span>
              </button>
            )}
            {!person.linkedinUrl && scannedLinkedinHasProfile && (
              <p className="text-[11px] text-muted-foreground/70 flex items-center gap-1.5">
                <Sparkles size={11} strokeWidth={1.75} className="text-sky-400" aria-hidden="true" />
                Hay una captura de LinkedIn — pegá la URL del perfil en Editar para enlazarla.
              </p>
            )}
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
      <ExternalLink size={13} strokeWidth={1.75} className="text-muted-foreground/40 group-hover:text-foreground shrink-0" aria-hidden="true" />
    </a>
  )
}
