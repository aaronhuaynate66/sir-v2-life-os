// SIR V2 — /agenda fusionada en /horario (lo accionable "Próximo" + el cockpit
// de calendario viven ahora en una sola sección). Redirect para no romper
// enlaces/marcadores viejos.
import { redirect } from 'next/navigation'

export default function AgendaPage() {
  redirect('/horario')
}
