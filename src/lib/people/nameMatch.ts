// SIR V2 — Guard de atribución (#129). ¿El nombre de un chat coincide con la
// persona a la que se le quiere asignar? Evita que un chat de "Marita" se cargue
// a "Nicolle" y la contamine. PURO.

function deburr(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
function toks(s: string): Set<string> {
  return new Set(deburr(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 3))
}

/** ¿Coinciden dos nombres? Reglas (de más fuerte a más débil):
 *  1. Uno contiene textualmente al otro (cubre acortamientos: "Diana" ↔ "Diana Carolina").
 *  2. Comparten ≥2 tokens significativos (ej. "Diana Carolina ❣️" ↔ "Diana Carolina Díaz S.").
 *  3. UN solo token compartido: SOLO si el nombre más corto está TOTALMENTE contenido
 *     en el otro (todos sus tokens compartidos).
 *  Un único token compartido cuando ambos tienen tokens propios NO alcanza — así
 *  "Carolina Insider One" ya NO matchea a "Diana Carolina Díaz Sánchez" por el mero
 *  "Carolina" (bug de atribución cruzada, 2026-07-16). */
export function namesLooselyMatch(a: string, b: string): boolean {
  const da = deburr(a).trim(), db = deburr(b).trim()
  if (!da || !db) return false
  if (da.includes(db) || db.includes(da)) return true
  const ta = toks(a), tb = toks(b)
  if (ta.size === 0 || tb.size === 0) return false
  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  if (shared >= 2) return true
  const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta]
  return [...small].every((t) => big.has(t))
}

/** true si el chat NO parece de esa persona (ni por nombre ni por alias). */
export function chatPersonMismatch(chatName: string, personName: string, aliases: string[] = []): boolean {
  if (!chatName) return false // sin nombre de chat no podemos juzgar → no molestar
  if (namesLooselyMatch(chatName, personName)) return false
  for (const a of aliases) if (namesLooselyMatch(chatName, a)) return false
  return true
}
