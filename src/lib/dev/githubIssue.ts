// SIR V2 — Crea un issue en GitHub para capturar un pedido de dev del bot de
// Telegram. Best-effort: asegura la label 'dev-inbox' antes (ignora si ya existe)
// y si el POST con label falla (validación), reintenta sin label. Devuelve
// { number, url } o null si no se pudo (p.ej. GITHUB_TOKEN sin permiso de issues).

const GH_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'sir-dev-bot',
  'Content-Type': 'application/json',
})

/** Crea la label 'dev-inbox' si no existe (422 = ya existe → ok). Best-effort. */
async function ensureDevInboxLabel(repo: string, token: string): Promise<void> {
  try {
    await fetch(`https://api.github.com/repos/${repo}/labels`, {
      method: 'POST',
      headers: GH_HEADERS(token),
      body: JSON.stringify({ name: 'dev-inbox', color: '5319e7', description: 'Pedido de dev capturado por el bot de Telegram' }),
    })
  } catch {
    /* best-effort: si ya existe o falla, seguimos igual */
  }
}

export async function createGithubIssue(
  repo: string,
  token: string,
  title: string,
  body: string,
): Promise<{ number: number; url: string } | null> {
  await ensureDevInboxLabel(repo, token)
  const url = `https://api.github.com/repos/${repo}/issues`
  const post = async (withLabel: boolean) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: GH_HEADERS(token),
      body: JSON.stringify(withLabel ? { title, body, labels: ['dev-inbox'] } : { title, body }),
    })
    if (!res.ok) return null
    const j = await res.json()
    return typeof j?.number === 'number' ? { number: j.number, url: j.html_url as string } : null
  }
  try {
    const issue = (await post(true)) ?? (await post(false))
    if (issue) await ensureLabelApplied(repo, token, issue.number)
    return issue
  } catch {
    return null
  }
}

/**
 * Aplica 'dev-inbox' al issue YA creado y avisa si no se pudo.
 *
 * Por qué hace falta un segundo POST: al CREAR un issue, GitHub **descarta en
 * silencio** el campo `labels` si el token no tiene push access — responde 201,
 * el issue queda sin label y no hay error en ningún lado. Pasó de verdad: #826,
 * #993 y #994 se crearon sin label y quedaron invisibles para la consulta de
 * arranque de la sesión (`gh issue list --label dev-inbox`), que es justo la
 * cola que CLAUDE.md manda vaciar. Tres pedidos de Aaron esperando en una cola
 * que nadie miraba.
 *
 * El endpoint dedicado sí devuelve error si falta permiso → dejamos traza en vez
 * de degradar callados. El issue ya existe igual; esto solo lo hace ENCONTRABLE.
 */
async function ensureLabelApplied(repo: string, token: string, issueNumber: number): Promise<void> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/issues/${issueNumber}/labels`, {
      method: 'POST',
      headers: GH_HEADERS(token),
      body: JSON.stringify({ labels: ['dev-inbox'] }),
    })
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[dev-inbox] no se pudo etiquetar el issue #${issueNumber} (${res.status}) — quedará fuera de la cola filtrada por label`)
    }
  } catch {
    // eslint-disable-next-line no-console
    console.warn(`[dev-inbox] no se pudo etiquetar el issue #${issueNumber} (red)`)
  }
}
