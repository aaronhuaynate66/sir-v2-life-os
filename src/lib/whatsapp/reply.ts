// SIR V2 — Resumen de confirmación para responder por WhatsApp. PURO.
//
// Tras ingerir un relato, SIR contesta "anotado: …" en lenguaje humano, para que
// Aaron sepa qué se guardó sin abrir la web. Honesto: muestra lo que se ejecutó
// OK, lo que falló, y lo ambiguo (que NO se guardó y pide aclaración).

import type { IngestAction } from '@/lib/relato-ingest/tools'
import type { RelatoIngestResult } from '@/lib/relato-ingest/run'

const LABEL: Record<string, [string, string]> = {
  crear_moment: ['momento', 'momentos'],
  crear_person_log: ['registro', 'registros'],
  crear_nota_manual: ['nota', 'notas'],
  crear_persona: ['persona nueva', 'personas nuevas'],
  crear_objetivo: ['objetivo', 'objetivos'],
  crear_recordatorio: ['recordatorio', 'recordatorios'],
  registrar_ciclo: ['dato de ciclo', 'datos de ciclo'],
  registrar_aprendizaje: ['aprendizaje', 'aprendizajes'],
}

function plural(kind: string, n: number): string {
  const l = LABEL[kind]
  if (!l) return `${n} ${kind}`
  return `${n} ${n === 1 ? l[0] : l[1]}`
}

/** Nombre de persona referida por una acción (para el resumen), o null. */
function personName(a: IngestAction): string | null {
  const rec = a as unknown as Record<string, unknown>
  const n = rec.person_full_name ?? rec.full_name ?? rec.name
  return typeof n === 'string' && n.trim() ? n.trim() : null
}

/**
 * Arma el texto de confirmación desde el resultado de la ingesta.
 * Cuenta lo ejecutado OK por tipo; lista lo ambiguo; avisa si algo falló.
 */
export function buildConfirmationReply(result: RelatoIngestResult): string {
  const executed = result.executed ?? []
  const okActions = executed.filter((e) => e.ok).map((e) => e.action)
  const failed = executed.filter((e) => !e.ok)

  // Conteo por tipo.
  const counts = new Map<string, number>()
  for (const a of okActions) counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1)

  const lines: string[] = []
  if (counts.size > 0) {
    const parts = [...counts.entries()].map(([kind, n]) => plural(kind, n))
    lines.push(`✅ Anotado: ${parts.join(', ')}.`)
    // Personas mencionadas (hasta 3) para dar contexto.
    const names = [...new Set(okActions.map(personName).filter((n): n is string => !!n))].slice(0, 3)
    if (names.length > 0) lines[0] += ` (con ${names.join(', ')})`
  } else if (executed.length === 0 && result.plan.length === 0 && result.ambiguous.length === 0) {
    lines.push('No encontré nada concreto para anotar. Contame con un poco más de detalle (quién, qué, cuándo).')
  }

  if (result.ambiguous.length > 0) {
    const amb = result.ambiguous
      .map((a) => personName(a))
      .filter((n): n is string => !!n)
    lines.push(
      amb.length > 0
        ? `⚠️ No pude ubicar a: ${amb.join(', ')}. ¿Nombre completo?`
        : '⚠️ Algo quedó ambiguo — dame el nombre completo y lo anoto.',
    )
  }

  if (failed.length > 0) {
    lines.push(failed.length === 1 ? '❌ 1 cosa no se pudo guardar.' : `❌ ${failed.length} cosas no se pudieron guardar.`)
  }

  return lines.join('\n') || 'Recibido.'
}
