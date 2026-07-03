// SIR V2 — Algoritmo SM-2 simplificado para spaced repetition.
//
// Grades:
//   0 = "no sabía / mal"           → reset a interval 1d, ease-=0.2
//   1 = "con dificultad"           → interval*ease*0.5, ease-=0.1
//   2 = "bien"                     → interval*ease
//   3 = "fácil"                    → interval*ease*1.3, ease+=0.1
//
// Card nueva (interval=0): grade 0/1 → interval 1d; grade 2/3 → interval 3d.
// Ease piso 1.3, techo 3.0.
// PURO. Testeable con inputs simples.

export type ReviewGrade = 0 | 1 | 2 | 3

export interface CardState {
  intervalDays: number
  easeFactor: number
  streak: number
}

export interface ReviewOutcome extends CardState {
  nextReviewInDays: number
}

const MIN_EASE = 1.3
const MAX_EASE = 3.0

function clampEase(e: number): number {
  return Math.min(MAX_EASE, Math.max(MIN_EASE, Math.round(e * 100) / 100))
}

export function applyReview(prev: CardState, grade: ReviewGrade): ReviewOutcome {
  // Card nueva (nunca revisada).
  if (prev.intervalDays === 0) {
    if (grade === 0 || grade === 1) {
      return { intervalDays: 1, easeFactor: clampEase(prev.easeFactor - (grade === 0 ? 0.2 : 0.1)), streak: 0, nextReviewInDays: 1 }
    }
    // grade 2 → 3d, grade 3 → 5d
    const days = grade === 2 ? 3 : 5
    return { intervalDays: days, easeFactor: clampEase(prev.easeFactor + (grade === 3 ? 0.1 : 0)), streak: 1, nextReviewInDays: days }
  }

  // Card ya vista.
  if (grade === 0) {
    return { intervalDays: 1, easeFactor: clampEase(prev.easeFactor - 0.2), streak: 0, nextReviewInDays: 1 }
  }
  if (grade === 1) {
    const next = Math.max(1, Math.round(prev.intervalDays * prev.easeFactor * 0.5))
    return { intervalDays: next, easeFactor: clampEase(prev.easeFactor - 0.1), streak: prev.streak + 1, nextReviewInDays: next }
  }
  if (grade === 2) {
    const next = Math.max(1, Math.round(prev.intervalDays * prev.easeFactor))
    return { intervalDays: next, easeFactor: clampEase(prev.easeFactor), streak: prev.streak + 1, nextReviewInDays: next }
  }
  // grade 3
  const next = Math.max(1, Math.round(prev.intervalDays * prev.easeFactor * 1.3))
  return { intervalDays: next, easeFactor: clampEase(prev.easeFactor + 0.1), streak: prev.streak + 1, nextReviewInDays: next }
}
