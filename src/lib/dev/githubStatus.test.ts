import { describe, it, expect } from 'vitest'
import { formatGithubStatus, type GithubStatus } from './githubStatus'

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
