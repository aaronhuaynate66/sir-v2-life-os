// SIR V2 — Procedencia y confianza de una memoria ("recibo por dato"). PURO.
//
// Diferenciador del benchmark (jul 2026): SIR nunca debe afirmar algo de una
// persona "a ciegas". Cada memoria muestra DE DÓNDE salió y CUÁN confiable es,
// para que Aaron confíe en lo que SIR dice y vea los recibos. La confianza se
// deriva del ORIGEN del dato:
//   - manual        → lo dijo Aaron mismo: certeza (no lo interpretó SIR).
//   - whatsapp_capture → de una conversación real: alta (SIR la leyó/estructuró).
//   - inferred      → derivada/inferida por SIR: media (razonable, no textual).
//   - (sin origen)  → legado sin registrar: incierta.
//
// Determinístico y sin I/O → testeable (ver provenance.test.ts).

import type { Memory } from '@/types'

export type MemoryConfidence = 'certain' | 'high' | 'medium' | 'unknown'
export type MemoryOriginIcon = 'chat' | 'manual' | 'inferred' | 'unknown'

export interface MemoryProvenance {
  /** De dónde salió el dato ("de tu chat", "lo anotaste tú", …). */
  label: string
  /** Confianza según el origen. */
  confidence: MemoryConfidence
  /** Frase corta de confianza ("confirmado por ti", "confianza alta", …). */
  confidenceLabel: string
  /** Clave de ícono para el render (mapea a lucide en el componente). */
  icon: MemoryOriginIcon
}

/** Deriva el recibo (origen + confianza) de una memoria a partir de su `source`. */
export function memoryProvenance(source: Memory['source']): MemoryProvenance {
  switch (source) {
    case 'manual':
      return { label: 'lo anotaste tú', confidence: 'certain', confidenceLabel: 'confirmado por ti', icon: 'manual' }
    case 'whatsapp_capture':
      return { label: 'de tu chat', confidence: 'high', confidenceLabel: 'confianza alta', icon: 'chat' }
    case 'inferred':
      return { label: 'derivada por SIR', confidence: 'medium', confidenceLabel: 'confianza media', icon: 'inferred' }
    default:
      return { label: 'origen sin registrar', confidence: 'unknown', confidenceLabel: 'confianza incierta', icon: 'unknown' }
  }
}
