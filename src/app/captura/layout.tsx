// SIR V2 — Layout del segmento /captura (Auditoría técnica — quick-win).
//
// PROBLEMA QUE RESUELVE: las páginas de captura eran `○ Static` (prerender),
// y tras un deploy el browser podía servir el HTML viejo apuntando a un chunk
// de JS viejo → la UI se veía vieja aunque el API respondiera lo nuevo (había
// que hacer hard-reload). Forzar el render dinámico (`ƒ Dynamic`) regenera el
// HTML por request con las referencias de bundle actuales → no más stale cache.
//
// Por qué un layout y no `export const dynamic` en cada page: las pages de
// captura son `'use client'`, y un layout (Server Component) es el lugar
// soportado y sin riesgo de build para fijar route-segment config. Aplica a
// todo el subárbol: /captura, /captura/bascula, /captura/whatsapp.
//
// Es un passthrough transparente: no agrega UI (cada page monta su AppShell).

export const dynamic = 'force-dynamic'

export default function CapturaLayout({ children }: { children: React.ReactNode }) {
  return children
}
