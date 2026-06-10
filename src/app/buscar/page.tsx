// SIR V2 — /buscar fusionado en /memoria (toggle "Buscar con IA").
// Se mantiene la ruta como redirect para no romper enlaces/marcadores viejos.
import { redirect } from 'next/navigation'

export default function BuscarPage() {
  redirect('/memoria')
}
