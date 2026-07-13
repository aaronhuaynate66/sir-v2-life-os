// SIR V2 — Estado técnico del repo desde la GitHub API (para el bot de dev).
//
// El bot @sir_aaron_dev_bot pasa de solo-notificar a RESPONDER: "¿cómo viene el
// deploy?", "¿qué PRs hay abiertos?", "¿pasó CI?". Este módulo trae el estado y
// lo formatea; el webhook lo pasa (con la pregunta) a un LLM para responder
// conversacional. Fail-open: sin token/red → estado vacío con nota.
//
// Necesita un token de GitHub en el server (GITHUB_TOKEN) porque el repo es
// privado. `formatGithubStatus` es PURO (testeable).

const GH = 'https://api.github.com'

export interface PrLite { number: number; title: string; author: string; draft: boolean }
export interface CommitLite { sha: string; message: string; author: string; date: string | null }
export interface GithubStatus {
  ok: boolean
  note?: string
  defaultBranch: string
  latestCommit: CommitLite | null
  latestCi: { status: string; conclusion: string | null } | null
  openPrs: PrLite[]
  recentMerged: PrLite[]
  recentCommits: CommitLite[]
}

async function gh(path: string, token: string): Promise<unknown | null> {
  try {
    const r = await fetch(`${GH}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'sir-dev-bot' },
    })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

/** Trae el estado técnico del repo. Fail-open: devuelve ok:false con nota si no
 *  hay token o falla la red. `repo` = "owner/name". */
export async function fetchGithubStatus(repo: string, token: string | undefined): Promise<GithubStatus> {
  const empty: GithubStatus = {
    ok: false, defaultBranch: 'main', latestCommit: null, latestCi: null,
    openPrs: [], recentMerged: [], recentCommits: [],
  }
  if (!token) return { ...empty, note: 'Falta GITHUB_TOKEN en el server para leer el repo (privado).' }
  if (!repo || !repo.includes('/')) return { ...empty, note: 'Repo mal configurado.' }

  const commits = (await gh(`/repos/${repo}/commits?per_page=5`, token)) as Array<Record<string, unknown>> | null
  const recentCommits: CommitLite[] = (commits ?? []).map((c) => {
    const commit = (c.commit ?? {}) as Record<string, unknown>
    const author = (commit.author ?? {}) as Record<string, unknown>
    return {
      sha: String(c.sha ?? '').slice(0, 7),
      message: String((commit.message ?? '')).split('\n')[0].slice(0, 100),
      author: String(author.name ?? '—'),
      date: (author.date as string) ?? null,
    }
  })
  const latestCommit = recentCommits[0] ?? null

  let latestCi: GithubStatus['latestCi'] = null
  if (latestCommit) {
    const runs = (await gh(`/repos/${repo}/commits/${latestCommit.sha}/check-runs`, token)) as Record<string, unknown> | null
    const arr = (runs?.check_runs as Array<Record<string, unknown>>) ?? []
    const validate = arr.find((r) => r.name === 'validate') ?? arr[0]
    if (validate) latestCi = { status: String(validate.status ?? '—'), conclusion: (validate.conclusion as string) ?? null }
  }

  const prs = (await gh(`/repos/${repo}/pulls?state=open&per_page=20`, token)) as Array<Record<string, unknown>> | null
  const openPrs: PrLite[] = (prs ?? []).map((p) => ({
    number: Number(p.number), title: String(p.title ?? '').slice(0, 100),
    author: String(((p.user ?? {}) as Record<string, unknown>).login ?? '—'), draft: !!p.draft,
  }))

  const merged = (await gh(`/repos/${repo}/pulls?state=closed&per_page=10&sort=updated&direction=desc`, token)) as Array<Record<string, unknown>> | null
  const recentMerged: PrLite[] = (merged ?? [])
    .filter((p) => !!p.merged_at)
    .slice(0, 5)
    .map((p) => ({
      number: Number(p.number), title: String(p.title ?? '').slice(0, 100),
      author: String(((p.user ?? {}) as Record<string, unknown>).login ?? '—'), draft: false,
    }))

  return { ok: true, defaultBranch: 'main', latestCommit, latestCi, openPrs, recentMerged, recentCommits }
}

/** Estado como texto plano para el prompt del LLM / respuesta directa. PURO. */
export function formatGithubStatus(s: GithubStatus): string {
  if (!s.ok) return `No pude leer el estado del repo. ${s.note ?? ''}`.trim()
  const lines: string[] = []
  if (s.latestCommit) {
    const ci = s.latestCi ? `${s.latestCi.status}${s.latestCi.conclusion ? '/' + s.latestCi.conclusion : ''}` : 'sin CI'
    lines.push(`Último commit en main: ${s.latestCommit.sha} "${s.latestCommit.message}" (${s.latestCommit.author}) · CI: ${ci}`)
  }
  lines.push(s.openPrs.length ? `PRs abiertos (${s.openPrs.length}): ${s.openPrs.map((p) => `#${p.number} ${p.title}${p.draft ? ' [draft]' : ''}`).join(' · ')}` : 'PRs abiertos: 0')
  if (s.recentMerged.length) lines.push(`Últimos merges: ${s.recentMerged.map((p) => `#${p.number} ${p.title}`).join(' · ')}`)
  if (s.recentCommits.length > 1) lines.push(`Commits recientes: ${s.recentCommits.slice(0, 5).map((c) => `${c.sha} ${c.message}`).join(' · ')}`)
  return lines.join('\n')
}
