'use client'
// SIR V2 — hook que trae el resumen relacional de la semana (server) para el
// Espejo y el Loop de Experimentos. Best-effort: si falla, devuelve undefined y
// el espejo cae a su versión solo-local.
import { useEffect, useState } from 'react'
import type { EspejoRelational } from '@/lib/self/espejoSemanal'

export function useEspejoRelacional(): EspejoRelational | undefined {
  const [rel, setRel] = useState<EspejoRelational | undefined>(undefined)
  useEffect(() => {
    let alive = true
    fetch('/api/self/espejo-relacional')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (alive && j && typeof j.interactions === 'number') {
          setRel({ interactions: j.interactions, tense: j.tense, openConflicts: j.openConflicts, topConflict: j.topConflict ?? null })
        }
      })
      .catch(() => { /* deja undefined */ })
    return () => { alive = false }
  }, [])
  return rel
}
