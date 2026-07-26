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
    case 'marcar_tarea':
      return `✅ Marcar la tarea "${(a.tarea || '').slice(0, 120)}" como hecha.\n\n¿La marco?`
    case 'agregar_hito':
      return `🎯 Agregar el paso "${(a.hito || '').slice(0, 120)}" a tu objetivo "${(a.objetivo || '').slice(0, 80)}"` +
        (a.fecha ? ` (para el ${a.fecha})` : '') + '.\n\n¿Lo agrego?'
    case 'crear_plan':
      return `🗓️ Agendar "${(a.titulo || '').slice(0, 120)}"${a.fecha ? ` para el ${a.fecha}` : ''}.\n\n¿Lo agendo?`
    case 'crear_recordatorio': {
      const t = Date.parse(a.cuando)
      const when = Number.isFinite(t)
        ? new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'America/Lima' }).format(new Date(t))
        : 'esa hora'
      return `⏰ Recordarte "${(a.texto || '').slice(0, 120)}" el ${when}.\n\n¿Lo agendo?`
    }
    case 'registrar_estado': {
      const label = a.estado === 'regla' ? 'período/regla' : 'ánimo bajo / tensa'
      const cuando = a.fecha ? `el ${a.fecha}` : 'hoy'
      const nota = (a.nota || '').trim()
      return `📔 Marcar que ${a.persona || 'esa persona'} estuvo con ${label} ${cuando}` +
        (nota ? ` ("${nota.slice(0, 120)}")` : '') +
        '.\nCon esto voy detectando si se repite en un patrón.\n\n¿Lo anoto?'
    }
    case 'registrar_entrenamiento': {
      const LABEL: Record<string, string> = {
        fuerza: 'fuerza', tecnica: 'técnica', sparring: 'sparring',
        acondicionamiento: 'acondicionamiento', competencia: 'competencia', otro: 'entrenamiento',
      }
      const dur = a.minutos ? `, ${a.minutos} min` : ''
      const inten = a.intensidad ? `, intensidad ${a.intensidad}` : ''
      const cuando = a.fecha ? `el ${a.fecha}` : 'hoy'
      const nota = (a.nota || '').trim()
      return `🥋 Anotar sesión de ${LABEL[a.tipo] ?? a.tipo}${dur}${inten} ${cuando}` +
        (nota ? ` ("${nota.slice(0, 120)}")` : '') +
        '.\nCuenta para el plan del Mundial.\n\n¿La anoto?'
    }
    default:
      return '¿Lo guardo?'
  }
}
