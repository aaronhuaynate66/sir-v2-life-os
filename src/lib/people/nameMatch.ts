// SIR V2 — Guard de atribución (#129). ¿El nombre de un chat coincide con la
// persona a la que se le quiere asignar? Evita que un chat de "Marita" se cargue
// a "Nicolle" y la contamine. PURO.

function deburr(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
function toks(s: string): Set<string> {
  return new Set(deburr(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 3))
}

/** Coinciden si comparten al menos un token significativo o uno contiene al otro. */
export function namesLooselyMatch(a: string, b: string): boolean {
  const da = deburr(a).trim(), db = deburr(b).trim()
  if (!da || !db) return false
  if (da.includes(db) || db.includes(da)) return true
  const ta = toks(a), tb = toks(b)
  for (const t of ta) if (tb.has(t)) return true
  return false
}

/** true si el chat NO parece de esa persona (ni por nombre ni por alias). */
export function chatPersonMismatch(chatName: string, personName: string, aliases: string[] = []): boolean {
  if (!chatName) return false // sin nombre de chat no podemos juzgar → no molestar
  if (namesLooselyMatch(chatName, personName)) return false
  for (const a of aliases) if (namesLooselyMatch(chatName, a)) return false
  return true
}
