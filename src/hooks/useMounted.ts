'use client'

// SIR V2 — useMounted
//
// Devuelve false en el server Y en el PRIMER render del cliente; true recién
// tras montar (useEffect). Sirve para diferir valores que dependen de "ahora"
// (new Date()/Date.now()/Intl sin timezone fija): el server y el primer render
// del cliente producen el MISMO HTML (placeholder), y el valor now-dependiente
// se computa solo después de montar — eliminando el mismatch de hidratación
// (#418) SIN gatear toda la página.

import { useEffect, useState } from 'react'

export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  return mounted
}
