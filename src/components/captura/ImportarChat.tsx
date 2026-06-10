'use client'
// SIR V2 — ImportarChat: subir el export de WhatsApp de OTRA persona y crear o
// vincular su contacto EN UN PASO (antes había que crear la persona primero y
// subir desde su ficha).
//
// Portón "¿de quién es?": si el nombre matchea una persona existente, se vincula;
// si no, se crea vía POST /api/people (persiste en DB → el endpoint del export ya
// no da 404 por FK). Resuelta la persona, se reusa AgregarCapturaPanel en modo
// 'whatsapp' (todo el pipeline parse→chunk→interpret→consolidate + revisión + persist).

import { useState } from 'react'
import { Loader2, MessagesSquare, ArrowRight, X } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRelationshipStore } from '@/stores'
import { createPerson } from '@/lib/capture/observations/client'
import { AgregarCapturaPanel } from '@/components/relaciones/AgregarCapturaPanel'

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

export function ImportarChat() {
  const people = useRelationshipStore((s) => s.people)
  const [name, setName] = useState('')
  const [resolved, setResolved] = useState<{ id: string; name: string; created: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function resolvePerson() {
    const n = name.trim()
    if (!n || busy) return
    setBusy(true)
    setErr(null)
    try {
      const existing = people.find((p) => norm(p.name) === norm(n))
      if (existing) {
        setResolved({ id: existing.id, name: existing.name, created: false })
      } else {
        // Crea el row en DB (server genera id + slug). El sync por realtime lo
        // baja al store; el export usa este id directo, sin esperar.
        const c = await createPerson({ name: n })
        setResolved({ id: c.person.id, name: c.person.name, created: true })
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  if (resolved) {
    return (
      <div className="mb-6">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-sm text-muted-foreground">
            Importando chat para{' '}
            <span className="font-medium text-foreground">{resolved.name}</span>
            {resolved.created && <span className="text-xs text-ok"> · contacto creado</span>}
          </div>
          <Button size="sm" variant="ghost" onClick={() => { setResolved(null); setName('') }}>
            <X size={13} strokeWidth={2} className="mr-1" aria-hidden="true" />
            cambiar
          </Button>
        </div>
        <AgregarCapturaPanel personId={resolved.id} personName={resolved.name} defaultMode="whatsapp" />
      </div>
    )
  }

  return (
    <Card className="mb-6 shadow-none">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-2">
          <MessagesSquare size={16} strokeWidth={1.75} className="text-primary flex-shrink-0" aria-hidden="true" />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Importar un chat de WhatsApp</div>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Subí el export de una conversación y creá o vinculá su contacto en un paso. ¿De quién es el chat?
        </p>
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del contacto (nuevo o existente)"
            list="importar-chat-people"
            className="flex-1"
            onKeyDown={(e) => { if (e.key === 'Enter') void resolvePerson() }}
          />
          <datalist id="importar-chat-people">
            {people.map((p) => <option key={p.id} value={p.name} />)}
          </datalist>
          <Button onClick={() => void resolvePerson()} disabled={!name.trim() || busy}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} strokeWidth={1.75} />}
            <span className="ml-1.5 hidden sm:inline">Continuar</span>
          </Button>
        </div>
        {err && <div className="text-xs text-bad mt-2">{err}</div>}
      </CardContent>
    </Card>
  )
}
