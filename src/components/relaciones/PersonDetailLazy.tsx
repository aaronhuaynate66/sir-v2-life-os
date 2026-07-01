'use client'

// SIR V2 — PersonDetailLazy · shim client para dynamic import de PersonDetail
//
// /relaciones/[slug] es la ruta con el First Load JS mas grande de la app
// (346 KB medido en el build local). El culpable es PersonDetail (64 KB
// propios + arrastre de todos los sub-paneles: BondEvolutionPanel,
// FechasImportantes, VidaProfesional, VidaSocial, RedesSociales,
// PerfilProfesional, LoPersonal, CorrelacionPanel, TimelineFeed, etc.).
//
// Este shim envuelve el import con next/dynamic + ssr:false, para que el
// primer request de la ruta cargue solo un placeholder + el chunk se pida
// on-demand al hidratar. La ficha entera queda del lado cliente. En el
// mientras tanto se ve un skeleton chico (min-height para no colapsar el
// scroll y que no haya un CLS grande cuando aparece el contenido real).
//
// Trade-off: al ser ssr:false, el server no renderiza el HTML de la ficha
// -> el usuario ve el skeleton por un instante mientras el chunk carga.
// No es problema para app privada con robots:noindex.

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'
import type { PersonDetail as PersonDetailType } from './PersonDetail'

const PersonDetail = dynamic(
  () => import('./PersonDetail').then((m) => ({ default: m.PersonDetail })),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-64 w-full bg-muted/40 rounded animate-pulse" />
        <div className="h-40 w-full bg-muted/30 rounded animate-pulse" />
      </div>
    ),
  },
)

type Props = ComponentProps<typeof PersonDetailType>

export function PersonDetailLazy(props: Props) {
  return <PersonDetail {...props} />
}
