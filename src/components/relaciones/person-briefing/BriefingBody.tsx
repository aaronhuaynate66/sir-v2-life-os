// SIR V2 — BriefingBody: render del briefing de persona ("Ponme al día").
// Parsea el texto estructurado ("TL;DR:", "Contexto:", …) en secciones; si no
// matchea el formato, cae a párrafos planos. Compartido entre el asistente de la
// ficha (PreguntarSobrePersona) y donde haga falta.

const SECTION_LABELS = ['TL;DR', 'Contexto', 'Dinámica', 'Sugerencia']

export function BriefingBody({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const labelMatch = SECTION_LABELS.find((l) =>
          block.toLowerCase().startsWith(l.toLowerCase() + ':'),
        )
        if (labelMatch) {
          const value = block.slice(labelMatch.length + 1).trim()
          const isTldr = labelMatch === 'TL;DR'
          return (
            <div key={i} className={isTldr ? 'rounded-md border border-brand/30 bg-brand/5 p-3' : ''}>
              <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary mb-1">
                {labelMatch}
              </div>
              <p className="text-sm text-foreground leading-relaxed">{value}</p>
            </div>
          )
        }
        return (
          <p key={i} className="text-sm text-foreground leading-relaxed">
            {block}
          </p>
        )
      })}
    </div>
  )
}
