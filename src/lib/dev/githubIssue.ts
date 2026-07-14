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
    return (await post(true)) ?? (await post(false))
  } catch {
    return null
  }
}
