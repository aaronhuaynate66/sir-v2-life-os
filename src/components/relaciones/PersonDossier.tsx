// SIR V2 — PersonDossier (Export Parte A: vista imprimible / PDF).
//
// Consolida lo clave de una persona en un layout limpio pensado para PAPEL
// (imprimir o "Guardar como PDF" del navegador). En pantalla está OCULTO
// (`hidden`); aparece sólo al imprimir (`print:block`), mientras el resto
// del detail page se oculta con `print:hidden`. Sin libs de PDF.
//
// Datos vía buildDossier (lib pura, testeada). El estilo usa colores
// imprimibles (negro sobre blanco) en vez del theme oscuro de pantalla.

import type { Person } from '@/types'
import type { Observation } from '@/lib/capture/observations/types'
import type { PersonLog } from '@/lib/person-logs/types'
import type { PersonSynthesis } from '@/lib/person-synthesis/types'
import { buildDossier } from '@/lib/export/dossier'

export interface PersonDossierProps {
  person: Person
  synthesis?: PersonSynthesis | null
  personLogs?: PersonLog[]
  observations?: Observation[]
  /** "Hoy" para countdowns/edad; default new Date() en cliente. */
  now?: Date
}

export function PersonDossier({
  person,
  synthesis = null,
  personLogs = [],
  observations = [],
  now,
}: PersonDossierProps) {
  const d = buildDossier(
    {
      person,
      personalSynthesis: synthesis?.synthesisText ?? null,
      personLogs,
      observations,
    },
    now ?? new Date(),
  )

  return (
    <div
      data-dossier
      className="hidden print:block text-black bg-white text-[12px] leading-relaxed"
    >
      {/* Encabezado */}
      <div className="border-b-2 border-black pb-2 mb-4">
        <div className="text-[10px] uppercase tracking-widest text-neutral-500">
          SIR V2 — Dossier de persona
        </div>
        <h1 className="text-2xl font-bold mt-1">{d.identity.name}</h1>
        {d.identity.alias && <div className="text-sm text-neutral-600">«{d.identity.alias}»</div>}
        <div className="text-[11px] text-neutral-600 mt-1">
          {d.identity.relationshipLabel} · {d.identity.categoryLabel}
          {d.identity.location ? ` · ${d.identity.location}` : ''}
        </div>
      </div>

      {/* Métricas clave */}
      <Section title="Resumen relacional">
        <div className="grid grid-cols-3 gap-3">
          <KV label="Importancia" value={`${d.identity.importanceScore}/10`} />
          <KV label="Confianza" value={`${d.identity.trustLevel}/10`} />
          <KV
            label="Último contacto"
            value={
              d.daysSinceContact != null
                ? `hace ${d.daysSinceContact} día${d.daysSinceContact === 1 ? '' : 's'}`
                : '—'
            }
          />
        </div>
        {d.lastContactFormatted && (
          <div className="text-[10px] text-neutral-500 mt-1">
            Fecha de último contacto: {d.lastContactFormatted}
          </div>
        )}
      </Section>

      {/* Lo personal */}
      {d.personal && (
        <Section title="Lo personal">
          {d.personal.split(/\n{2,}/).map((p, i) => (
            <p key={i} className="mb-1.5">
              {p.trim()}
            </p>
          ))}
        </Section>
      )}

      {/* Fechas importantes */}
      {d.specialDates.length > 0 && (
        <Section title="Fechas importantes">
          <ul className="space-y-0.5">
            {d.specialDates.map((s, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>
                  <strong>{s.label}</strong> — {s.dateFormatted}
                </span>
                <span className="text-neutral-600">{s.countdownPhrase}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Redes */}
      {d.hasNetworks && (
        <Section title="Redes y contacto">
          <ul className="space-y-0.5">
            {d.networks.phone && <li>Teléfono: {d.networks.phone}</li>}
            {d.networks.instagram && <li>Instagram: @{d.networks.instagram}</li>}
            {d.networks.linkedin && <li>LinkedIn: {d.networks.linkedin}</li>}
            {d.networks.twitter && <li>X/Twitter: @{d.networks.twitter}</li>}
          </ul>
        </Section>
      )}

      {/* Bitácora reciente */}
      {d.recentTimeline.length > 0 && (
        <Section title="Bitácora reciente">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-neutral-400 text-left">
                <th className="py-1 pr-2 font-semibold">Fecha</th>
                <th className="py-1 pr-2 font-semibold">Tipo</th>
                <th className="py-1 font-semibold">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {d.recentTimeline.map((e, i) => (
                <tr key={i} className="border-b border-neutral-200 align-top">
                  <td className="py-1 pr-2 whitespace-nowrap">{e.dateFormatted}</td>
                  <td className="py-1 pr-2 whitespace-nowrap">{e.label}</td>
                  <td className="py-1">{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <div className="text-[9px] text-neutral-400 mt-6 pt-2 border-t border-neutral-300">
        Generado por SIR V2 · {d.generatedAtIso.slice(0, 16).replace('T', ' ')} UTC ·
        Documento personal y confidencial.
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 break-inside-avoid">
      <h2 className="text-[10px] uppercase tracking-widest text-neutral-500 border-b border-neutral-300 pb-1 mb-2">
        {title}
      </h2>
      {children}
    </section>
  )
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-neutral-500">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  )
}
