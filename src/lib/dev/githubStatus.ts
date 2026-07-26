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

  // 30 y no 5: con 5 commits el bot respondía "no se ha trabajado todavía" sobre
  // cosas mergeadas horas antes (25-jul: negó el soporte de páginas de Instagram
  // —#972— porque ya había salido de la ventana). Una jornada activa mueve 20+.
  const commits = (await gh(`/repos/${repo}/commits?per_page=30`, token)) as Array<Record<string, unknown>> | null
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

  const merged = (await gh(`/repos/${repo}/pulls?state=closed&per_page=30&sort=updated&direction=desc`, token)) as Array<Record<string, unknown>> | null
  const recentMerged: PrLite[] = (merged ?? [])
    .filter((p) => !!p.merged_at)
    .slice(0, 20)
    .map((p) => ({
      number: Number(p.number), title: String(p.title ?? '').slice(0, 100),
      author: String(((p.user ?? {}) as Record<string, unknown>).login ?? '—'), draft: false,
    }))

  return { ok: true, defaultBranch: 'main', latestCommit, latestCi, openPrs, recentMerged, recentCommits }
}

// Palabras que no sirven para buscar en el historial del repo.
const STOP_DEV = new Set([
  'que', 'como', 'cual', 'cuando', 'donde', 'quien', 'para', 'por', 'con', 'sin',
  'los', 'las', 'una', 'unos', 'unas', 'del', 'este', 'esta', 'esto', 'eso',
  'esta', 'estan', 'ya', 'esta', 'hay', 'sir', 'repo', 'codigo', 'commit',
  'commits', 'merge', 'quedaron', 'quedo', 'dentro', 'sus', 'mis', 'tus',
  'saber', 'quiero', 'puedes', 'revisa', 'reviso', 'hiciste', 'esta',
])

/**
 * Términos de búsqueda salientes de una pregunta técnica. PURO.
 * "¿lo de las historias de Instagram de empresas ya quedaron asociadas?" →
 * ["instagram", "historias", "empresas", "asociadas"].
 */
export function devSearchTerms(question: string, max = 4): string[] {
  const words = (question || '')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_DEV.has(w))
  const seen = new Set<string>()
  const out: string[] = []
  for (const w of words.sort((a, b) => b.length - a.length)) {
    if (seen.has(w)) continue
    seen.add(w)
    out.push(w)
    if (out.length >= max) break
  }
  return out
}

/**
 * Busca en TODO el historial de commits (Search API), no solo en la ventana
 * reciente. Es lo que evita el "no se ha trabajado todavía" sobre algo mergeado
 * hace una semana. Fail-open → []. Una llamada por término, en paralelo.
 */
export async function searchCommits(
  repo: string, token: string | undefined, terms: string[], perTerm = 5,
): Promise<CommitLite[]> {
  if (!token || terms.length === 0) return []
  const results = await Promise.all(terms.slice(0, 4).map(async (t) => {
    const q = encodeURIComponent(`repo:${repo} ${t}`)
    const r = (await gh(`/search/commits?q=${q}&per_page=${perTerm}&sort=committer-date&order=desc`, token)) as Record<string, unknown> | null
    const items = (r?.items as Array<Record<string, unknown>>) ?? []
    return items.map((c) => {
      const commit = (c.commit ?? {}) as Record<string, unknown>
      const author = (commit.author ?? {}) as Record<string, unknown>
      return {
        sha: String(c.sha ?? '').slice(0, 7),
        message: String(commit.message ?? '').split('\n')[0].slice(0, 120),
        author: String(author.name ?? '—'),
        date: (author.date as string) ?? null,
      }
    })
  }))
  const seen = new Set<string>()
  const out: CommitLite[] = []
  for (const c of results.flat()) {
    if (seen.has(c.sha)) continue
    seen.add(c.sha)
    out.push(c)
  }
  return out.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? ''))).slice(0, 12)
}

/** Los commits encontrados, como bloque para el prompt. PURO. */
export function formatCommitSearch(terms: string[], hits: CommitLite[]): string {
  if (terms.length === 0) return ''
  const cabeza = `BÚSQUEDA EN TODO EL HISTORIAL por: ${terms.map((t) => `"${t}"`).join(', ')}.`
  if (hits.length === 0) {
    return `${cabeza}\nSin coincidencias con esas palabras. Eso NO prueba que no exista: puede llamarse distinto. Dilo así — con las palabras que se buscaron — y ofrece buscar con otras. NO concluyas que no se hizo.`
  }
  return `${cabeza}\n${hits.map((c) => `  - ${c.sha} ${c.message} (${(c.date ?? '').slice(0, 10)})`).join('\n')}`
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
