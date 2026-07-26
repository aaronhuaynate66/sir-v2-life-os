import { describe, it, expect } from 'vitest'
import { formatGithubStatus, devSearchTerms, formatCommitSearch, type GithubStatus, type CommitLite } from './githubStatus'

const base: GithubStatus = {
  ok: true, defaultBranch: 'main',
  latestCommit: { sha: 'abc1234', message: 'feat: algo', author: 'Aaron', date: '2026-07-12T00:00:00Z' },
  latestCi: { status: 'completed', conclusion: 'success' },
  openPrs: [{ number: 40, title: 'wip', author: 'aaron', draft: true }],
  recentMerged: [{ number: 39, title: 'fix cosa', author: 'aaron', draft: false }],
  recentCommits: [
    { sha: 'abc1234', message: 'feat: algo', author: 'Aaron', date: null },
    { sha: 'def5678', message: 'fix: otra', author: 'Aaron', date: null },
  ],
}

describe('formatGithubStatus', () => {
  it('resume commit, CI, PRs abiertos y merges', () => {
    const s = formatGithubStatus(base)
    expect(s).toContain('abc1234')
    expect(s).toMatch(/completed\/success/)
    expect(s).toMatch(/#40 wip \[draft\]/)
    expect(s).toMatch(/#39 fix cosa/)
  })
  it('dice PRs abiertos: 0 cuando no hay', () => {
    expect(formatGithubStatus({ ...base, openPrs: [] })).toMatch(/PRs abiertos: 0/)
  })
  it('reporta la nota si no pudo leer (ok:false)', () => {
    const s = formatGithubStatus({ ...base, ok: false, note: 'Falta GITHUB_TOKEN' })
    expect(s).toMatch(/no pude leer/i)
    expect(s).toContain('Falta GITHUB_TOKEN')
  })
})

describe('devSearchTerms', () => {
  it('saca los términos útiles de la pregunta REAL que falló el 25-jul', () => {
    const t = devSearchTerms('Quiero saber si lo de las historias de Instagram de empresas ya quedaron asociadas a sus perfiles dentro de sir')
    expect(t).toContain('instagram')
    expect(t.length).toBeLessThanOrEqual(4)
    expect(t).not.toContain('quiero')
    expect(t).not.toContain('dentro')
  })

  it('una pregunta sin sustancia no genera búsqueda', () => {
    expect(devSearchTerms('¿ya hay commits en el repo de sir?')).toEqual([])
  })

  it('no repite términos', () => {
    expect(devSearchTerms('instagram instagram instagram perfiles').filter((x) => x === 'instagram')).toHaveLength(1)
  })
})

describe('formatCommitSearch', () => {
  const hit: CommitLite = {
    sha: '8025d36', message: 'feat(reader): las páginas dejan de ser ruido — IG ↔ organización',
    author: 'Aaron', date: '2026-07-25T14:00:00Z',
  }

  it('con hallazgos los lista con fecha', () => {
    const out = formatCommitSearch(['instagram'], [hit])
    expect(out).toContain('"instagram"')
    expect(out).toContain('8025d36')
    expect(out).toContain('2026-07-25')
  })

  it('SIN hallazgos prohíbe concluir que no existe', () => {
    const out = formatCommitSearch(['instagram'], [])
    expect(out).toContain('Sin coincidencias')
    expect(out).toContain('NO prueba que no exista')
    expect(out).toContain('NO concluyas que no se hizo')
  })

  it('sin términos no hay bloque', () => {
    expect(formatCommitSearch([], [hit])).toBe('')
  })
})
