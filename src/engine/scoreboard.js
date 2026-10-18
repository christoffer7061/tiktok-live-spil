// Total points across rounds for the current stream, plus streaks.
//
// Streak bonus: the 2nd correct answer in a row gives +100, the 3rd +200 …
// up to the max (+500). A wrong answer or a missed round resets the streak.
export class Scoreboard {
  constructor({ streakBonusPerAnswer = 100, streakBonusMax = 500 } = {}) {
    this.bonusStep = streakBonusPerAnswer;
    this.bonusMax = streakBonusMax;
    this.players = new Map(); // userId -> { name, points, streak, correct }
  }

  #player(userId, name) {
    let p = this.players.get(userId);
    if (!p) {
      p = { userId, name, points: 0, streak: 0, correct: 0 };
      this.players.set(userId, p);
    }
    if (name) p.name = name;
    return p;
  }

  streakBonus(streak) {
    return Math.min(Math.max(streak - 1, 0) * this.bonusStep, this.bonusMax);
  }

  // Adds a finished round. Returns Map userId -> { points, bonus, streak }.
  applyRound(round, multiplier = 1) {
    const result = new Map();
    for (const [userId, a] of round.answered) {
      const p = this.#player(userId, a.name);
      if (a.correct) {
        p.streak++;
        p.correct++;
        const bonus = this.streakBonus(p.streak);
        const points = Math.round(a.points * multiplier) + bonus;
        p.points += points;
        result.set(userId, { points, bonus, streak: p.streak });
      } else {
        p.streak = 0;
        result.set(userId, { points: 0, bonus: 0, streak: 0 });
      }
    }
    // Viewers who did not answer this round lose their streak.
    for (const [userId, p] of this.players) if (!round.answered.has(userId)) p.streak = 0;
    return result;
  }

  // Extra points from outside a round (e.g. gifts). Never affects round winners.
  addBonus(userId, name, points) {
    this.#player(userId, name).points += points;
  }

  streakOf(userId) {
    return this.players.get(userId)?.streak ?? 0;
  }

  top(n = 10) {
    return [...this.players.values()]
      .filter((p) => p.points > 0)
      .sort((a, b) => b.points - a.points)
      .slice(0, n)
      .map((p, i) => ({ rank: i + 1, name: p.name, points: p.points, streak: p.streak }));
  }

  get size() {
    return this.players.size;
  }

  clear() {
    this.players.clear();
  }
}
