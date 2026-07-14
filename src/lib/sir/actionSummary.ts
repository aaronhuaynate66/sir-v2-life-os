// SIR V2 — Resumen humano de una acción propuesta, para el prompt de confirmación
// del chat ("¿Lo registro?"). PURO. Sin markdown (Telegram lo muestra crudo).

import type { ProposedActionResolved } from '@/lib/sir/askSir'

export function summarizeActionForConfirm(a: ProposedActionResolved): string {
  switch (a.kind) {
    case 'registrar_interaccion': {
      const nota = (a.nota || '').trim()
      const tono = Math.max(1, Math.min(5, Math.round(Number(a.calidad) || 3)))
      return `📝 Anotar interacción con ${a.persona || 'esa persona'} (tono ${tono}/5)` +
        (nota ? `:\n"${nota.slice(0, 200)}"` : '') + '\n\n¿Lo registro?'
    }
    case 'crear_objetivo':
      return `🎯 Crear objetivo: "${(a.titulo || '').slice(0, 120)}"\n\n¿Lo creo?`
    case 'crear_persona':
      return `👤 Agregar a ${(a.nombre || '').slice(0, 80)} a tu red.\n\n¿La agrego?`
    case 'cerrar_relacion':
      return `🔚 Cerrar el vínculo con ${a.persona || 'esa persona'}.\n\n¿Lo cierro?`
    case 'marcar_habito':
      return `✅ Marcar el hábito "${(a.habito || '').slice(0, 80)}" como hecho hoy.\n\n¿Lo marco?`
    default:
      return '¿Lo guardo?'
  }
}
