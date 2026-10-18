// Kahoot-style points: 1000 for an instant answer, 500 just before time runs out.
// points = round(max × (1 − (answerTime / timeLimit) / 2))
export function computePoints(answerMs, limitMs, maxPoints = 1000) {
  if (!(limitMs > 0)) return 0;
  const t = Math.min(Math.max(answerMs, 0), limitMs);
  return Math.round(maxPoints * (1 - t / limitMs / 2));
}
