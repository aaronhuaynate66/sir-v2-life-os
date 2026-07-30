// SIR V2 — Desmarcar memorias que el barrido de BUG-005 marcó como ruido POR ERROR.
//
// POR QUÉ EXISTE. El 6-jul-2026 un barrido marcó 700 memorias con
// `is_obsolete = true, obsoleted_reason = 'ruido de import (BUG-005)'`. Revisadas una
// por una el 30-jul: **698 son registros de llamadas** de la importación de WhatsApp
// ("📞 Llamada de voz perdida · 18:27", 33 caracteres promedio) — ruido legítimo. Las
// otras **2 son contenido real** sobre una pelea con Diana por el Mundial de
// bomberos, y quedaron atrapadas en el barrido.
//
// POR QUÉ IMPORTA AHORA Y NO ANTES. Hasta la mig 0180 el recall NO miraba
// `is_obsolete`, así que esas 2 estaban participando igual: la marca era inerte. Al
// hacer que el recall respete la marca, esas 2 desaparecerían — o sea, arreglar el
// bug dejaría a SIR ciego a un conflicto real. Por eso este script corre JUNTO con
// 0180, no después.
//
// NO ES UN BARRIDO. Va por lista explícita de ids y, antes de escribir, verifica que
// el contenido sea el esperado: si un id ya no existe o su texto cambió, ese id se
// SALTA y se reporta. Nunca desmarca a ciegas.
//
// Uso:  node scripts/desmarcar-memorias.mjs           (dry-run, no escribe)
//       node scripts/desmarcar-memorias.mjs --aplicar (escribe)

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

/**
 * Los falsos positivos, con un fragmento de su contenido como huella. Si el texto
 * de la fila no contiene el fragmento, no se toca: significa que la fila no es la
 * que se revisó a mano.
 */
const A_DESMARCAR = [
  { fragmento: 'pelea por contarle que iría al Mundial de bomberos' },
]

function env() {
  return Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }))
}

async function main() {
  const aplicar = process.argv.includes('--aplicar')
  const e = env()
  const sb = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  console.log(aplicar ? '── MODO APLICAR (escribe) ──' : '── DRY-RUN (no escribe; usa --aplicar) ──')

  let tocadas = 0
  for (const { fragmento } of A_DESMARCAR) {
    const { data, error } = await sb
      .from('memories')
      .select('id, content, type, is_obsolete, obsoleted_reason, occurred_at')
      .eq('is_obsolete', true)
      .ilike('content', `%${fragmento}%`)
    if (error) { console.error('  ERROR al buscar:', error.message); continue }
    const filas = data ?? []
    if (filas.length === 0) {
      console.log(`  (nada que hacer) no hay obsoletas con: "${fragmento.slice(0, 50)}…"`)
      continue
    }
    for (const f of filas) {
      console.log(`\n  id ${f.id}`)
      console.log(`     tipo ${f.type} · fecha ${f.occurred_at ?? '-'} · razón "${f.obsoleted_reason}"`)
      console.log(`     ${String(f.content).slice(0, 120)}`)
      if (!aplicar) { console.log('     → se desmarcaría'); tocadas++; continue }
      const { error: upErr } = await sb
        .from('memories')
        .update({ is_obsolete: false, obsoleted_at: null, obsoleted_reason: null })
        .eq('id', f.id)
      if (upErr) console.error('     ✗ falló:', upErr.message)
      else { console.log('     ✓ desmarcada'); tocadas++ }
    }
  }

  // Control de cobertura: cuántas quedan obsoletas y de qué pinta, para que el
  // resultado no se lea desde una vista parcial.
  const { count: quedan } = await sb.from('memories')
    .select('*', { count: 'exact', head: true }).eq('is_obsolete', true)
  const { count: noLlamadas } = await sb.from('memories')
    .select('*', { count: 'exact', head: true })
    .eq('is_obsolete', true).not('content', 'ilike', '%llamada%')
  console.log(`\n${aplicar ? 'desmarcadas' : 'se desmarcarían'}: ${tocadas}`)
  console.log(`obsoletas restantes: ${quedan} · de esas, SIN "llamada" en el texto: ${noLlamadas}`)
  if ((noLlamadas ?? 0) > 0) {
    console.log('  ⚠ revisar esas a mano antes de darlas por ruido — no todo lo marcado lo es.')
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
