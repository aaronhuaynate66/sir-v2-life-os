// SIR V2 — /relato → redirect a /relato/ingest.
//
// El /relato viejo fue reemplazado por /relato/ingest en la sesión 02-jul-2026:
// nueva UI conversacional (chat) + tools completas (moment, log, nota, ciclo,
// cumpleaños, objetivo, persona) + streaming SSE + edit inline por item +
// undo con timer + apply strict + historial persistente. Cubre todo lo que
// el router viejo hacía, con UX moderna.
//
// Redirect 308 (permanente) — cualquier link/bookmark viejo aterriza en el
// nuevo. El código legacy quedó en git history si alguien necesita mirarlo.

import { redirect } from 'next/navigation'

export default function RelatoLegacyPage(): never {
  redirect('/relato/ingest')
}
