'use client'

// SIR V2 — RelationalFlagsCard (19·M3): red flags de auto-protección.
// Corre el motor puro detectRelationalFlags sobre las notas de person_logs y, si
// hay patrones RECURRENTES en cómo te tratan, los muestra con foco en TU cuidado.
// LÍNEA ÉTICA: no rotula a la persona, no diagnostica; son patrones que VOS
// anotaste. Solo aparece con recurrencia (nunca por una nota suelta). Peligro
// real → hablarlo con alguien/un profesional.

import { useMemo } from 'react'
import { ShieldAlert } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { detectRelationalFlags } from '@/engines/relational-flags'
import type { PersonLog } from '@/lib/person-logs/types'

export function RelationalFlagsCard({ personName, personLogs }: { personName: string; personLogs: PersonLog[] }) {
  const result = useMemo(
    () => detectRelationalFlags(personLogs.map((l) => l.note)),
    [personLogs],
  )

  // Sin patrones recurrentes no mostramos nada — no se alarma por una nota suelta.
  if (result.level === 'none') return null

  const first = (personName || '').trim().split(/\s+/)[0] || 'esta persona'
  const concern = result.level === 'concern'

  return (
    <Card className={`shadow-none ${concern ? 'border-bad/40' : 'border-warn/40'}`}>
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldAlert size={14} strokeWidth={1.75} className={concern ? 'text-bad' : 'text-warn'} aria-hidden="true" />
          <h2 className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">Señales a cuidar</h2>
        </div>

        <p className="text-[12px] text-muted-foreground leading-relaxed">
          Notaste patrones que se repiten en cómo {first} te trata. Esto <span className="text-foreground/85">no es un diagnóstico de {first}</span> —
          son cosas que vos registraste, acá para que te cuides.
        </p>

        <ul className="space-y-2.5">
          {result.flags.map((f) => (
            <li key={f.flag}>
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] font-medium text-foreground">{f.label}</span>
                <span className="text-[10px] font-mono text-muted-foreground/60">en {f.occurrences} registros</span>
              </div>
              <p className="text-[12px] text-muted-foreground leading-relaxed">{f.care}</p>
            </li>
          ))}
        </ul>

        {result.seekSupport && (
          <p className="text-[12px] leading-relaxed rounded-md border border-bad/30 bg-bad-soft/30 px-3 py-2 text-foreground/90">
            Estos patrones ameritan hablarlo con alguien de confianza o un profesional. No tenés que resolverlo solo — pedir apoyo es cuidarte, no exagerar.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
