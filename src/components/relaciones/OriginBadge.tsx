// SIR V2 — OriginBadge: de dónde SALE un dato/lectura de la ficha.
//
// La auditoría pidió hacer visible la procedencia en las cards clave, para que
// se distinga de un vistazo lo que SIR calculó (determinístico) vs lo que
// escribió la IA vs lo que cargaste a mano vs lo que se extrajo de una captura.
// Chip chico, mono, no invasivo. El acento de marca (brand) queda reservado
// para el origen IA — consistente con la regla del sistema (brand = IA).

import { Cpu, Sparkles, PenLine, ScanLine } from 'lucide-react'

import { Badge } from '@/components/ui/badge'

export type DataOrigin = 'computed' | 'ai' | 'manual' | 'extracted'

const ORIGIN: Record<DataOrigin, { label: string; Icon: typeof Cpu; cls: string; hint: string }> = {
  computed: {
    label: 'Computado',
    Icon: Cpu,
    cls: 'text-muted-foreground border-border',
    hint: 'Calculado por SIR de forma determinística a partir de tus datos.',
  },
  ai: {
    label: 'IA',
    Icon: Sparkles,
    cls: 'text-brand-soft-foreground border-brand/30 bg-brand/5',
    hint: 'Generado por IA — orientativo, edítalo antes de usarlo.',
  },
  manual: {
    label: 'Manual',
    Icon: PenLine,
    cls: 'text-muted-foreground border-border',
    hint: 'Cargado por ti a mano.',
  },
  extracted: {
    label: 'Extraído',
    Icon: ScanLine,
    cls: 'text-ok border-ok/30',
    hint: 'Extraído de una captura (foto / texto / conversación).',
  },
}

export function OriginBadge({ origin, className = '' }: { origin: DataOrigin; className?: string }) {
  const o = ORIGIN[origin]
  const Icon = o.Icon
  return (
    <Badge variant="outline" title={o.hint} className={`text-[10px] font-mono gap-1 ${o.cls} ${className}`}>
      <Icon size={10} strokeWidth={2} aria-hidden="true" />
      {o.label}
    </Badge>
  )
}
