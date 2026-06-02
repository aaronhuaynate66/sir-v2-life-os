// SIR V2 — VidaSocial (#7 del detail page V1): TERCER eje narrativo.
//
// Junto a "Vida profesional" (#6) y "Lo personal" (#8), completa los tres ejes
// de la ficha (profesional / social / personal). En V1 eran texto editable; v2
// los tiene como síntesis: profesional/social determinísticas (sin LLM) y
// personal por IA cacheada.
//
// Fuente del eje SOCIAL: la captura de Instagram (identidad, alcance, bio,
// seguidores en común). Render DETERMINÍSTICO — sin LLM, sin riesgo de 502.
//
// PERSISTENCIA (GEMA 2): prefiere el texto PERSISTIDO en person_profile_axes
// (0047, generado al capturar) y cae al cómputo EN VIVO si la fila no existe
// (migración sin correr, captura previa al feature, o edición manual). Así el
// eje funciona siempre, sin recomputar IA en cada carga.
//
// El detalle interactivo de Instagram (handles, links, contadores, seguidores
// en común clickeables) NO se duplica acá: vive en "Redes & social"
// (RedesSociales). Este eje es la PROSA sintetizada, como "Lo personal".

import { Users } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { latestOfType, readInstagram } from '@/lib/observations/profile'
import { socialNarrative } from '@/lib/person-synthesis/narrative'
import type { Observation } from '@/lib/capture/observations/types'
import type { PersonProfileAxes } from '@/lib/person-axes/types'

export interface VidaSocialProps {
  observations: Observation[]
  /** Ejes persistidos (0047). null si no hay fila → caemos al cómputo en vivo. */
  axes: PersonProfileAxes | null
}

export function VidaSocial({ observations, axes }: VidaSocialProps) {
  const obs = latestOfType(observations, 'instagram')
  const ig = obs ? readInstagram(obs.data) : null

  // Persistido manda; si no hay, computamos en vivo (backward-compat).
  const liveNarrative = socialNarrative({ ig })
  const narrative = axes?.socialText ?? liveNarrative

  return (
    <Card className="shadow-none mb-4">
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Users
            size={14}
            strokeWidth={1.75}
            className="text-muted-foreground/70"
            aria-hidden="true"
          />
          <div className="text-[11px] uppercase tracking-[0.07em] text-text-tertiary">
            Vida social
          </div>
        </div>

        {narrative ? (
          <>
            <p className="text-sm text-foreground leading-relaxed">{narrative}</p>
            {obs && (
              <div className="text-[10px] font-mono text-muted-foreground/50 border-t border-border/40 pt-2 mt-3">
                instagram · {obs.confidence ?? 'sin confianza'}
                {/* Detalle (contadores, bio, seguidores en común) en Redes & social. */}
              </div>
            )}
          </>
        ) : (
          <EmptyState />
        )}
      </CardContent>
    </Card>
  )
}

function EmptyState() {
  return (
    <div className="text-sm text-muted-foreground space-y-1.5">
      <p>Sin captura de Instagram.</p>
      <p className="text-xs leading-relaxed">
        Subí un pantallazo del perfil con{' '}
        <span className="font-medium text-foreground">Agregar captura</span> (arriba) para sintetizar
        esta sección — identidad social, alcance y seguidores en común.
      </p>
    </div>
  )
}
