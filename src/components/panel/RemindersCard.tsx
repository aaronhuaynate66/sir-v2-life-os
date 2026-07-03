'use client'
// SIR V2 — RemindersCard: recordatorios agendados desde /relato/ingest.
//
// Muestra los pendientes cuyo due_at es ≤ hoy+3d. Aaron los marca hechos con
// click. Se oculta si no hay ninguno.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { AlarmClock, Circle, CheckCircle2 } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface Reminder {
  id: string
  text: string
  due_at: string
  related_person_id: string | null
  related_goal_id: string | null
  done_at: string | null
  notified_at: string | null
  person_name: string | null
  person_slug: string | null
}

function formatWhen(iso: string): { label: string; overdue: boolean; today: boolean } {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { label: iso, overdue: false, today: false }
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const overdue = diffMs < 0
  const today = d.toDateString() === now.toDateString()
  const abs = Math.abs(diffMs)
  const mins = Math.round(abs / 60_000)
  const hrs = Math.round(mins / 60)
  const days = Math.round(hrs / 24)
  let label = ''
  if (overdue) label = mins < 60 ? `hace ${mins}m` : hrs < 24 ? `hace ${hrs}h` : `hace ${days}d`
  else if (today) label = mins < 60 ? `en ${mins}m` : `hoy ${d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`
  else label = days < 7 ? `en ${days}d` : d.toLocaleDateString('es', { day: '2-digit', month: 'short' })
  return { label, overdue, today }
}

export function RemindersCard() {
  const [reminders, setReminders] = useState<Reminder[] | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/reminders?scope=pending', { cache: 'no-store' })
      if (!r.ok) { setReminders([]); return }
      const j = (await r.json()) as { reminders?: Reminder[] }
      const cutoff = new Date(Date.now() + 3 * 86_400_000).toISOString()
      setReminders((j.reminders ?? []).filter((rem) => rem.due_at <= cutoff))
    } catch { setReminders([]) }
  }, [])

  useEffect(() => { void load() }, [load])

  async function markDone(id: string) {
    setReminders((prev) => prev?.filter((r) => r.id !== id) ?? [])
    try {
      await fetch('/api/reminders', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'done' }),
      })
    } catch { /* silent */ }
  }

  if (!reminders || reminders.length === 0) return null

  return (
    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mb-4">
      <Card className="shadow-none">
        <CardContent className="p-4 sm:p-5 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <AlarmClock size={14} strokeWidth={1.75} className="text-muted-foreground/70" aria-hidden="true" />
            <span className="text-[10px] uppercase tracking-widest text-text-tertiary font-sans">
              Recordatorios
            </span>
            <Badge variant="outline" className="text-[10px] font-mono">{reminders.length}</Badge>
          </div>
          <ul className="space-y-1">
            <AnimatePresence initial={false}>
              {reminders.map((r) => {
                const w = formatWhen(r.due_at)
                return (
                  <motion.li
                    key={r.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className={cn(
                      'flex items-start gap-2 px-2 py-1.5 rounded-md',
                      w.overdue ? 'bg-bad-soft/40' : w.today ? 'bg-warn-soft/40' : 'bg-muted/20',
                    )}>
                      <button
                        type="button"
                        onClick={() => void markDone(r.id)}
                        className="flex-shrink-0 mt-0.5 text-muted-foreground/70 hover:text-ok transition-colors"
                        aria-label="Marcar como hecho"
                      >
                        <Circle size={13} strokeWidth={1.75} />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground leading-snug">{r.text}</p>
                        <div className="text-[10px] text-muted-foreground/80 flex items-center gap-2 mt-0.5">
                          <span className={cn(w.overdue ? 'text-bad font-medium' : w.today ? 'text-warn' : '')}>
                            {w.label}
                          </span>
                          {r.person_name && (
                            <>
                              <span>·</span>
                              <Link
                                href={r.person_slug ? `/relaciones/${r.person_slug}` : '/relaciones'}
                                className="hover:text-foreground underline underline-offset-2"
                              >
                                {r.person_name.split(' ')[0]}
                              </Link>
                            </>
                          )}
                          {r.notified_at && (
                            <>
                              <span>·</span>
                              <span className="inline-flex items-center gap-0.5">
                                <CheckCircle2 size={9} /> notificado
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        </CardContent>
      </Card>
    </motion.div>
  )
}
