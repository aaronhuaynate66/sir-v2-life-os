// SIR V2 — Footprint de un EPISODIO sobre un objetivo (Paso 3 PR-2). PURO.
// Si un episodio ABIERTO comparte tema con el objetivo, lo mostramos en el
// objetivo: "no es un capricho, toca a N personas". Reusa el tokenizador de #92.
import { extractKeywords } from './conflictFriction'

export interface EpisodeLite { id: string; title: string; detail?: string | null; status: string; participantIds: string[] }
export interface EpisodeMatch { id: string; title: string; participantIds: string[]; sharedKeywords: string[] }

export function matchEpisodesToGoal(goalTitle: string, goalDescription: string | undefined, episodes: EpisodeLite[]): EpisodeMatch[] {
  const gk = new Set(extractKeywords(`${goalTitle} ${goalDescription ?? ''}`))
  if (gk.size === 0) return []
  const out: EpisodeMatch[] = []
  for (const e of episodes) {
    if (e.status !== 'abierto') continue
    const shared = extractKeywords(`${e.title} ${e.detail ?? ''}`).filter((k) => gk.has(k))
    if (shared.length > 0) out.push({ id: e.id, title: e.title, participantIds: e.participantIds ?? [], sharedKeywords: shared })
  }
  return out.sort((a, b) => b.participantIds.length - a.participantIds.length)
}
