'use client'
// SIR V2 — Hook compartido de la "ventana de contacto".
//
// Arma las señales (último contacto, fecha próxima, conflicto abierto, tono, fase
// sensible) y computa el estado con computeContactWindow (puro). Lo usan tanto el
// CareBanner del hero como el ContactWindowBadge del pie — misma fuente, sin
// duplicar. best-effort: si /api/moments falla, computa sin conflicto abierto.

import { useEffect, useMemo, useState } from 'react'

import { computeContactWindow, type ContactWindow } from '@/lib/relationships/contactWindow'
import { computeSpecialDateCountdown } from '@/lib/dates/specialDates'
import { cyclePhase } from '@/lib/ciclo/phase'
import type { Person } from '@/types'

function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000))
}

export function useContactWindow(person: Person, lastTone: number | null = null): ContactWindow {
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

  return useMemo(() => {
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
}
