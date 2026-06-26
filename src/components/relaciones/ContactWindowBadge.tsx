'use client'
// SIR V2 — Ventana de Contacto (Motor #6). ¿Buen momento para escribirle?
// Cruza señales que ya tiene la ficha (último contacto, fechas próximas,
// conflictos abiertos, fase del ciclo) → estado + por qué + tono. Consideración,
// no extracción.

import { useEffect, useMemo, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { SectionTitle } from '@/components/ui/section-title'
import type { Person } from '@/types'
import { cyclePhase } from '@/lib/ciclo/phase'
import { computeSpecialDateCountdown } from '@/lib/dates/specialDates'
import { computeContactWindow, type ContactWindowState } from '@/lib/relationships/contactWindow'

const META: Record<ContactWindowState, { label: string; color: string }> = {
  buen_momento: { label: 'Buen momento', color: '#2dd4a7' },
  con_cuidado: { label: 'Con cuidado', color: '#e0a93b' },
  neutral: { label: 'Cuando quieras', color: '#8a8f98' },
}

function daysSince(iso: string | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00`)
  if (!Number.isFinite(t)) return null
  return Math.floor((Date.now() - t) / 86_400_000)
}

export function ContactWindowBadge({ person, lastTone = null }: { person: Person; lastTone?: number | null }) {
  const [openConflict, setOpenConflict] = useState(false)
  const [conflictTitle, setConflictTitle] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/moments?person_id=${encodeURIComponent(person.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j?.moments) return
        const open = (j.moments as Array<{ status: string; title: string }>).filter((m) => m.status === 'abierto')
        setOpenConflict(open.length > 0)
        setConflictTitle(open[0]?.title ?? null)
      })
      .catch(() => { /* best-effort */ })
    return () => { alive = false }
  }, [person.id])

  const win = useMemo(() => {
    // próxima fecha importante (special dates + cumple sintetizado del birthDate)
    const dates = [...(person.specialDates ?? [])]
    if (person.birthDate) dates.push({ id: 'bday', label: 'su cumple', date: person.birthDate, recurring: true })
    let upcomingInDays: number | null = null
    let upcomingLabel: string | null = null
    for (const sd of dates) {
      const cd = computeSpecialDateCountdown(sd)
      if (cd && cd.daysUntil >= 0 && (upcomingInDays === null || cd.daysUntil < upcomingInDays)) {
        upcomingInDays = cd.daysUntil
        upcomingLabel = sd.label
      }
    }
    const cycleSensitive =
      !!person.cycleStartDate && cyclePhase(person.cycleStartDate, person.cycleLengthDays ?? 28)?.phase === 'menstrual'

    return computeContactWindow({
      daysSinceContact: daysSince(person.lastContact),
      upcomingEventInDays: upcomingInDays,
      upcomingEventLabel: upcomingLabel,
      openConflict,
      conflictTitle,
      lastTone,
      cycleSensitive,
      importance: person.importanceScore ?? 5,
    })
  }, [person, openConflict, conflictTitle, lastTone])

  const meta = META[win.state]

  return (
    <Card style={{ borderColor: `${meta.color}55` }}>
      <CardContent className="p-4 sm:p-6">
        <SectionTitle icon={MessageCircle} label="Ventana de contacto" />
        <div className="mt-2 flex items-center gap-2">
          <span className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold" style={{ backgroundColor: `${meta.color}22`, color: meta.color }}>
            {meta.label}
          </span>
          <span className="text-[13px] text-foreground/90">{win.reason}</span>
        </div>
        <p className="mt-2 text-[13px] text-muted-foreground">Cómo entrar: {win.tone}</p>
      </CardContent>
    </Card>
  )
}
